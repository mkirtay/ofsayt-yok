import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useI18n, useTranslation } from '@/lib/i18n';
import { REFEREE_RATING_SCORES } from '@/lib/refereeRating';
import styles from './refereeRating.module.scss';

type RatingState = { average: number | null; count: number; userScore: number | null };

type Props = { matchId: string; refereeName?: string | null };

/**
 * Maç sonrası "Hakemi puanla" satırı (Genel Bakış; yalnız maç bitmiş ve puanlama süresi açıkken çizilir — karar
 * çağıranda, bkz. lib/refereeRating.ts `refereeRatingWindow`). 1–10 düğmeleri herkese görünür; girişsiz kullanıcı
 * basınca giriş sayfasına (dönüş bu maç). Ortalama yalnız puan verdikten sonra görünür (oy vermeden önce yönlendirmesin).
 * Yükseklik veri gelmeden de sabit: alt satır her durumda tek satır yer tutar (CLS yok).
 */
export default function RefereeRating({ matchId, refereeName }: Props) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const router = useRouter();
  const { status } = useSession();
  const [state, setState] = useState<RatingState | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/matches/${matchId}/referee-rating`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RatingState | null) => {
        if (!cancelled && d) setState(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId, status]);

  const rate = useCallback(
    async (score: number) => {
      if (status !== 'authenticated') {
        void router.push(`/auth/signin?callbackUrl=${encodeURIComponent(router.asPath)}`);
        return;
      }
      if (saving != null || closed) return;
      setSaving(score);
      setMessage(null);
      try {
        const res = await fetch(`/api/matches/${matchId}/referee-rating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setState(data as RatingState);
        else if (res.status === 401) void router.push(`/auth/signin?callbackUrl=${encodeURIComponent(router.asPath)}`);
        else if (res.status === 409) {
          setClosed(true);
          setMessage(t('refereeRating.closed'));
        } else setMessage(t(res.status === 429 ? 'refereeRating.rateLimited' : 'refereeRating.error'));
      } catch {
        setMessage(t('refereeRating.error'));
      } finally {
        setSaving(null);
      }
    },
    [status, saving, closed, matchId, router, t],
  );

  const userScore = state?.userScore ?? null;
  const avg =
    state?.average != null ? state.average.toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
  const name = refereeName?.trim();

  let foot: React.ReactNode;
  if (message) foot = <span className={styles.message}>{message}</span>;
  else if (saving != null) foot = t('refereeRating.saving');
  else if (userScore != null && state) {
    foot = (
      <>
        {avg ? <strong className={styles.avg}>{t('refereeRating.summary', { avg, count: state.count })}</strong> : null}
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <span>{t('refereeRating.yourScore', { score: userScore })}</span>
      </>
    );
  } else foot = t(status === 'unauthenticated' ? 'refereeRating.loginHint' : 'refereeRating.hint');

  return (
    <section className={styles.card} aria-labelledby={`referee-rating-${matchId}`}>
      <div className={styles.head}>
        <h3 id={`referee-rating-${matchId}`} className={styles.title}>
          <span className={styles.whistle} aria-hidden="true" />
          {t('refereeRating.title')}
        </h3>
        <p className={styles.subtitle}>{name ? t('refereeRating.subtitle', { name }) : t('refereeRating.subtitleNoName')}</p>
      </div>
      <div className={styles.scale} role="group" aria-label={t('refereeRating.groupLabel')}>
        {REFEREE_RATING_SCORES.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.score}
            data-tone={s <= 3 ? 'low' : s <= 6 ? 'mid' : 'high'}
            aria-pressed={userScore === s}
            aria-label={t('refereeRating.scoreAria', { score: s })}
            disabled={closed || saving != null}
            onClick={() => void rate(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className={styles.foot} aria-live="polite">
        {foot}
      </p>
    </section>
  );
}
