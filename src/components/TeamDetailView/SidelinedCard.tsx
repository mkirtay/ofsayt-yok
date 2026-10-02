import { useState, type Ref } from 'react';
import Link from 'next/link';
import { SkeletonBlock } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { SidelinedPlayer, SidelinedReason, TeamSidelined } from '@/services/sportmonks/teamSidelined';
import styles from './teamDetailView.module.scss';

export const SIDELINED_ROWS = 5;

type Props = {
  cardRef?: Ref<HTMLElement>;
  loading: boolean;
  error: boolean;
  data: TeamSidelined | null;
};

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/**
 * Sakat ve cezalı oyuncular (takımın bugünkü durumu, sezon seçiciden bağımsız). İlk 5 satır sabit yerde; fazlası
 * "Tümü" ile açılır (kullanıcı eylemi). UEFA kadrosuna yazılmamış oyuncular listede değil, altta tek satır not.
 */
export default function SidelinedCard({ cardRef, loading, error, data }: Props) {
  const { t } = useTranslation('team');
  const [expanded, setExpanded] = useState(false);
  const players = data?.players ?? [];
  const shown = expanded ? players : players.slice(0, SIDELINED_ROWS);
  const slots = Math.max(SIDELINED_ROWS, shown.length);

  const reasonLabel = (r: SidelinedReason) => {
    const key = `sidelined.reasons.${r.code}`;
    const tr = r.code ? t(key) : key;
    if (tr !== key) return tr;
    return r.name || t(`sidelined.category.${r.category}`);
  };
  const untilLabel = (p: SidelinedPlayer) => (p.until ? t('sidelined.until', { date: ddmm(p.until) }) : t('sidelined.untilUnknown'));

  return (
    <section ref={cardRef} className={styles.statsCard} aria-busy={loading || undefined}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('sidelined.title')}</h3>
        {!loading && players.length > SIDELINED_ROWS ? (
          <button type="button" className={styles.cardHeadBtn} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? t('sidelined.less') : t('sidelined.all', { count: players.length })}
          </button>
        ) : null}
      </div>

      <ul className={styles.scorersList}>
        {Array.from({ length: slots }, (_, i) => {
          if (loading) {
            return (
              <li key={i} className={styles.scorerRow} aria-hidden="true">
                <SkeletonBlock width={24} height={24} className={styles.scorerPhoto} />
                <SkeletonBlock width="60%" height={12} />
              </li>
            );
          }
          const p = shown[i];
          if (!p) {
            if (i === 0 && !error) {
              return (
                <li key={i} className={`${styles.scorerRow} ${styles.scorerRowEmpty}`}>
                  <span className={styles.sidelinedEmpty}>{t('sidelined.empty')}</span>
                </li>
              );
            }
            return <li key={i} className={`${styles.scorerRow} ${styles.scorerRowEmpty}`} aria-hidden="true" />;
          }
          const suspended = p.reasons.every((r) => r.category === 'suspended');
          return (
            <li key={p.playerId} className={styles.scorerRow}>
              <Link href={`/players/${p.playerId}`} prefetch={false} className={styles.scorerLink}>
                {p.photo ? (
                  <TeamLogo src={p.photo} alt="" className={styles.scorerPhoto} width={24} height={24} />
                ) : (
                  <span className={`${styles.scorerPhoto} ${styles.squadPhotoEmpty}`} aria-hidden="true" />
                )}
                <span className={styles.sidelinedText}>
                  <span className={styles.scorerName}>{p.name}</span>
                  <span className={styles.sidelinedReason}>{p.reasons.map(reasonLabel).join(' · ')}</span>
                </span>
                <span
                  className={`${styles.sidelinedBadge} ${suspended ? styles.sidelinedBadgeSuspended : styles.sidelinedBadgeInjury}`}
                  title={untilLabel(p)}
                >
                  {suspended ? t('sidelined.category.suspended') : t('sidelined.category.injury')}
                </span>
                <span className={styles.sidelinedUntil}>{p.until ? ddmm(p.until) : '—'}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.summaryFoot}>
        {loading ? null : error ? (
          <span>{t('sidelined.error')}</span>
        ) : data && data.notInUefaSquad > 0 ? (
          <span title={t('sidelined.uefaHint')}>{t('sidelined.notInUefaSquad', { count: data.notInUefaSquad })}</span>
        ) : null}
      </div>
    </section>
  );
}
