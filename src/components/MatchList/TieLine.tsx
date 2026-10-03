import type { Match } from '@/models/liveScore';
import { useTranslation } from '@/lib/i18n';
import { useTieSummary } from '@/hooks/useTieSummary';
import styles from './matchList.module.scss';

/**
 * İki ayaklı eşleşmenin 2. maçında skorun altında toplam ("Top. 2–2"; penaltılı bitişte "PEN 4–3"). Yalnız 2. ayak
 * satırında çizilir ve yeri (sabit yükseklikli satır) baştan ayrılıdır: toplam 1. ayaktan sonradan hesaplansa da
 * satır kaymaz. Mobilde dar skor kolonu için kısa biçim ("(2–2)" / "P 4–3").
 */
export default function TieLine({ match }: { match: Match }) {
  const { t } = useTranslation('match');
  const tie = useTieSummary(match);
  if (!tie) return <span className={styles.tieLine} aria-hidden="true">&nbsp;</span>;
  const total = { home: tie.home, away: tie.away };
  const pens = tie.penalties;
  const wide = pens ? t('aggregate.pens', pens) : t('aggregate.short', total);
  const compact = pens ? t('aggregate.pensCompact', pens) : t('aggregate.compact', total);
  const label = [t('aggregate.total', total), pens ? t('aggregate.ariaPens', pens) : null].filter(Boolean).join(', ');
  return (
    <span className={styles.tieLine} title={label} aria-label={label}>
      <span className={styles.tieWide} aria-hidden="true">{wide}</span>
      <span className={styles.tieCompact} aria-hidden="true">{compact}</span>
    </span>
  );
}
