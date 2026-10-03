import type { Match } from '@/models/liveScore';
import { useTranslation } from '@/lib/i18n';
import { useTieSummary } from '@/hooks/useTieSummary';
import styles from './matchCard.module.scss';

/**
 * İki ayaklı eşleşmenin 2. maçında toplam hapı: "Toplam 2–2 · Galatasaray turu geçti" (penaltılı bitişte
 * "· PEN 4–3"). Yalnız 2. ayakta çizilir; yer (sabit yükseklik) baştan ayrılı → toplam 1. ayaktan sonradan
 * hesaplansa da kart uzamaz (CLS 0).
 */
export default function TiePill({ match }: { match: Match }) {
  const { t } = useTranslation('match');
  const tie = useTieSummary(match);
  if (!tie) return <div className={styles.tieRow} aria-hidden="true" />;
  const winnerName = tie.winner === 'home' ? match.home?.name : tie.winner === 'away' ? match.away?.name : null;
  const parts = [
    t('aggregate.total', { home: tie.home, away: tie.away }),
    winnerName ? t('aggregate.advanced', { team: winnerName }) : null,
    tie.penalties ? t('aggregate.pens', tie.penalties) : null,
  ].filter(Boolean);
  return (
    <div className={styles.tieRow}>
      <span className={styles.tiePill}>{parts.join(' · ')}</span>
    </div>
  );
}
