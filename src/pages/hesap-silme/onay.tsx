import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import Container from '@/components/Container';
import { ACCOUNT_DELETION_PATH, useAccountDeletionText } from '@/components/AccountDeletion/content';
import styles from '@/components/AccountDeletion/accountDeletion.module.scss';
import { brandTitle } from '@/config/brand';

type View = 'checking' | 'ready' | 'deleting' | 'invalid' | 'done';

/** `#token=<64 hex>` — belirteç URL parçasında: sunucuya, günlüklere ve Referer'a gitmez. */
function readTokenFromHash(): string {
  const m = /(?:^|[#&])token=([0-9a-f]{64})(?:&|$)/.exec(window.location.hash);
  return m ? m[1] : '';
}

/**
 * E-postadaki bağlantının açtığı onay sayfası (dizine kapalı). Açılınca yalnız geçerlilik sorulur; silme ancak düğmeye
 * basınca POST ile olur (e-posta önizleyicileri / güvenlik tarayıcıları bağlantıyı açsa da bir şey silinmez).
 */
export default function HesapSilmeOnayPage() {
  const { text, locale } = useAccountDeletionText();
  const c = text.confirm;
  const { status: sessionStatus } = useSession();
  const [view, setView] = useState<View>('checking');
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const token = useRef('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    token.current = readTokenFromHash();
    if (!token.current) {
      setView('invalid');
      return;
    }
    let cancelled = false;
    fetch('/api/account-deletion/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.current, check: true }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ valid?: boolean }>) : { valid: false }))
      .then((d) => !cancelled && setView(d.valid ? 'ready' : 'invalid'))
      .catch(() => !cancelled && setView('invalid'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Görünüm değişince odak başlığa: ekran okuyucu yeni durumu duyar.
  useEffect(() => {
    if (view !== 'checking' && view !== 'deleting') headingRef.current?.focus();
  }, [view]);

  const handleDelete = useCallback(async () => {
    setError('');
    setView('deleting');
    try {
      const res = await fetch('/api/account-deletion/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.current, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string; emailSent?: boolean };
      if (res.ok) {
        // Belirteç artık geçersiz; adres çubuğundan da kalksın.
        window.history.replaceState(null, '', window.location.pathname);
        if (sessionStatus === 'authenticated') await signOut({ redirect: false }).catch(() => {});
        setEmailSent(data.emailSent === true);
        setView('done');
        return;
      }
      if (res.status === 410) {
        setView('invalid');
        return;
      }
      setError(res.status === 429 ? c.rateLimited : data.code === 'PROTECTED_ACCOUNT' ? c.protected : c.error);
      setView('ready');
    } catch {
      setError(c.connectionError);
      setView('ready');
    }
  }, [c, locale, sessionStatus]);

  return (
    <>
      <Head>
        <title>{brandTitle(c.pageTitle, '—')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Container>
        <div className={styles.page}>
          {view === 'checking' ? (
            <>
              <h1 className={styles.title}>{c.pageTitle}</h1>
              <p className={styles.intro} role="status">
                {c.checking}
              </p>
            </>
          ) : null}

          {view === 'ready' || view === 'deleting' ? (
            <section className={styles.dangerCard} aria-labelledby="hs-confirm">
              <h1 id="hs-confirm" ref={headingRef} tabIndex={-1} className={styles.title}>
                {c.heading}
              </h1>
              <p className={styles.body}>{c.body}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={view === 'deleting'}>
                  {view === 'deleting' ? c.submitting : c.submit}
                </button>
                <Link href="/" className={styles.secondaryButton}>
                  {c.cancel}
                </Link>
              </div>
              <div aria-live="assertive" className={styles.liveRegion}>
                {error ? <p className={styles.error}>{error}</p> : null}
              </div>
            </section>
          ) : null}

          {view === 'invalid' ? (
            <section className={styles.card} aria-labelledby="hs-invalid">
              <h1 id="hs-invalid" ref={headingRef} tabIndex={-1} className={styles.title}>
                {c.invalidHeading}
              </h1>
              <p className={styles.body}>{c.invalidBody}</p>
              <div className={styles.actions}>
                <Link href={ACCOUNT_DELETION_PATH} className={styles.primaryButton}>
                  {c.requestNew}
                </Link>
              </div>
            </section>
          ) : null}

          {view === 'done' ? (
            <section className={styles.card} aria-labelledby="hs-done">
              <h1 id="hs-done" ref={headingRef} tabIndex={-1} className={styles.title}>
                {c.doneHeading}
              </h1>
              <p className={styles.body}>
                {c.doneBody}
                {emailSent ? ` ${c.doneEmail}` : null}
              </p>
              <div className={styles.actions}>
                <Link href="/" className={styles.primaryButton}>
                  {c.home}
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </Container>
    </>
  );
}
