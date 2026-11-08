import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import { buildMatchHref } from '@/utils/matchUrl';
import { REFEREE_RATING_MIN_VOTES, type RefereeFanRating as FanRating } from '@/lib/refereeRating';
import styles from './personPage.module.scss';
import fan from './refereeFanRating.module.scss';

/**
 * Hakem sayfası "Taraftar puanı": maç sonrası verilen 1–10 puanların ortalaması + oy sayısı + son puanlanan maçlar.
 * Sayfanın ISR verisine girmez; istemcide hafif uçtan çekilir (`/api/referees/{id}/fan-rating`, CDN 5 dk). Sayfanın en
 * altında: geç gelen veri görünür içeriği kaydırmaz. `REFEREE_RATING_MIN_VOTES`'tan az oyda ortalama yerine "yetersiz oy".
 */
export default function RefereeFanRating({ refereeId }: { refereeId: number }) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const [data, setData] = useState<FanRating | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/referees/${refereeId}/fan-rating`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: FanRating) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refereeId]);

  if (failed) return null;
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
  const enough = data != null && data.count >= REFEREE_RATING_MIN_VOTES && data.average != null;

  return (
    <section className={styles.card} aria-labelledby="ref-fan-rating" aria-busy={data == null}>
      <h2 id="ref-fan-rating" className={styles.sectionTitle}>
        {t('refereeRating.fanTitle')}
      </h2>
      {data == null ? (
        <div className={fan.skeleton} aria-hidden="true" />
      ) : data.count === 0 ? (
        <p className={styles.empty}>{t('refereeRating.fanNone')}</p>
      ) : (
        <div className={fan.body}>
          <div className={fan.score} data-testid="referee-fan-score">
            {enough ? (
              <p className={fan.big}>
                {nf(data.average!)}
                <span className={fan.outOf}>{t('refereeRating.fanOutOf')}</span>
              </p>
            ) : (
              <p className={fan.insufficient} title={t('refereeRating.fanInsufficientHint', { min: REFEREE_RATING_MIN_VOTES })}>
                {t('refereeRating.fanInsufficient')}
              </p>
            )}
            <p className={fan.votes}>{t('refereeRating.fanVotes', { count: data.count })}</p>
            {!enough ? <p className={fan.hint}>{t('refereeRating.fanInsufficientHint', { min: REFEREE_RATING_MIN_VOTES })}</p> : null}
          </div>
          {data.recent.length > 0 ? (
            <div className={fan.recent}>
              <h3 className={fan.recentTitle}>{t('refereeRating.fanRecent')}</h3>
              <ul className={fan.list}>
                {data.recent.map((m) => (
                  <li key={m.matchId} className={fan.row}>
                    <Link
                      href={buildMatchHref({ id: Number(m.matchId), home: { name: m.homeName }, away: { name: m.awayName } })}
                      className={fan.matchLink}
                      prefetch={false}
                    >
                      {m.homeName} – {m.awayName}
                    </Link>
                    <span className={fan.date}>{dateFmt.format(new Date(m.kickoffAt))}</span>
                    <span className={fan.rowScore}>
                      {m.count >= REFEREE_RATING_MIN_VOTES ? nf(m.average) : '—'}
                      <span className={fan.rowVotes}>{t('refereeRating.fanVotes', { count: m.count })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
