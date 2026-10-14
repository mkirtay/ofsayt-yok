import type { GetStaticProps } from 'next'
import { useEffect, useState, FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import '@/lib/i18nNamespaces/auth';
import { safeCallbackPath } from '@/lib/authRedirect'
import { PRIVACY_PATH, TERMS_PATH } from '@/config/legalConsent'
import styles from './auth.module.scss'

/** Dönüş adresi doğrudan URL'den (router.isReady'ye bağlı kalmadan); kendisine dönmesin. */
function readTarget(): string {
  const target = safeCallbackPath(new URLSearchParams(window.location.search).get('callbackUrl'))
  return target.startsWith('/auth/onay') ? '/' : target
}

/**
 * Kullanım Şartları + Gizlilik onayı: Google ile ilk girişten sonra ve onayı kayıtlı olmayan eski hesaplar için
 * (components/TermsConsentGate oturum başına bir kez buraya yönlendirir). Zorunlu değil ("Şimdi değil"): kullanıcı
 * kilitlenmez, yalnız analiz açma ve Gündem paylaşımı onaya kadar 403 TERMS_REQUIRED alır (lib/termsConsentGate.ts).
 */
export default function TermsConsentPage() {
  const router = useRouter()
  const { t } = useTranslation('auth')
  const { data: session, status, update } = useSession()
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const alreadyAccepted = session?.user?.termsAccepted === true
  const redirecting = status === 'unauthenticated' || (status === 'authenticated' && alreadyAccepted)

  useEffect(() => {
    if (status === 'unauthenticated') void router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(readTarget())}`)
    else if (status === 'authenticated' && alreadyAccepted) void router.replace(readTarget())
  }, [router, status, alreadyAccepted])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!accepted) {
      setError(t('consent.required'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/user/terms-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedTerms: true }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error || t('consent.error'))
        return
      }
      // Oturumdaki bayrak sunucuda DB'den tazelenir (auth-options jwt → trigger 'update').
      await update({ termsAccepted: true })
      void router.replace(readTarget())
    } catch {
      setError(t('consent.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Head>
        <title>{t('consent.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        {status === 'loading' || redirecting ? null : (
          <form className={styles.card} onSubmit={handleSubmit}>
            <h1 className={styles.title}>{t('consent.title')}</h1>
            <p className={styles.footer}>{t('consent.intro')}</p>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <label className={styles.consent}>
              <input
                type="checkbox"
                className={styles.consentBox}
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                required
              />
              <span>
                {t('consent.consentBefore')}
                <a href={TERMS_PATH} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {t('consent.termsLink')}
                  <span className={styles.srOnly}> {t('consent.opensInNewTab')}</span>
                </a>
                {t('consent.consentMiddle')}
                <a href={PRIVACY_PATH} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {t('consent.privacyLink')}
                  <span className={styles.srOnly}> {t('consent.opensInNewTab')}</span>
                </a>
                {t('consent.consentAfter')}
              </span>
            </label>

            <button className={styles.submit} type="submit" disabled={saving || !accepted}>
              {saving ? t('consent.submitting') : t('consent.submit')}
            </button>

            <p className={styles.footer}>
              {/* Form yalnızca istemcide (oturum çözülünce) render edilir → window güvenli */}
              <Link href={readTarget()} className={styles.link}>
                {t('consent.later')}
              </Link>
            </p>
          </form>
        )}
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
  },
})
