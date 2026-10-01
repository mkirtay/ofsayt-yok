import { useEffect, useState, type ComponentType } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import type { Match } from '@/models/liveScore';
import { useNow } from '@/hooks/useNow';
import { formatFixtureDate } from '@/utils/fixtureDateLabel';
import { countdown, kickoffInfo, type Countdown } from '@/utils/kickoff';
import styles from './preMatchStats.module.scss';

// 08 sahnesi ayrı parçada (yerel import(): ortak LazyLoad'a bağımlılık ana sayfa parçalarını bölüyordu). Kutu
// (96 px, düz yeşil) baştan yer tutar.
const loadKickoffRing = () => import('@/components/PitchScenes/KickoffRing');

function countdownText(c: Countdown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (c.kind === 'soon') return t('countdown.soon');
  if (c.kind === 'awaiting') return t('countdown.awaiting');
  const parts = c.days > 0
    ? [t('countdown.days', { n: c.days }), c.hours > 0 ? t('countdown.hours', { n: c.hours }) : '']
    : [c.hours > 0 ? t('countdown.hours', { n: c.hours }) : '', t('countdown.minutes', { n: c.minutes })];
  return t('countdown.startsIn', { left: parts.filter(Boolean).join(' ') });
}

/**
 * Başlamamış maçta istatistik kartı (08): animasyon + "Maç henüz başlamadı." + ilk düdük tarihi/saati + geri sayım.
 * Tarih/saat sabit (SSR/CDN HTML'inde aynı); geri sayım yalnız mount sonrası, satırı baştan ayrılmış (kayma yok).
 */
export default function PreMatchStats({ match, title }: { match: Match; title: string }) {
  const { t } = useTranslation('matchState');
  const { locale } = useI18n();
  const [Ring, setRing] = useState<ComponentType | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadKickoffRing().then(
      (mod) => {
        if (!cancelled) setRing(() => mod.default);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const kickoff = kickoffInfo(match);
  const now = useNow(30_000, kickoff != null);
  const when = kickoff ? `${formatFixtureDate(kickoff.dayIso, locale)}, ${kickoff.time}` : null;

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.pitch}>{Ring ? <Ring /> : null}</div>
      <div className={styles.message} role="status">
        <strong>{t('pre.statsTitle')}</strong>
        <span className={styles.sub}>{t('pre.statsSub')}</span>
        {when ? (
          <>
            <span className={styles.kick}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              {t('pre.kickoff', { when })}
            </span>
            <span className={styles.countdown} aria-live="off">
              {now != null && kickoff ? countdownText(countdown(kickoff.ms, now), t) : ' '}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
