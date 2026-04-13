import styles from './matchStats.module.scss';
import { MatchStatsData } from '@/models/domain';

interface MatchStatsProps {
  stats: MatchStatsData | null;
}

const STAT_LABELS: Record<string, string> = {
  possesion: 'Topa Sahip Olma',
  shots_on_target: 'İsabetli Şut',
  shots_off_target: 'İsabetsiz Şut',
  attempts_on_goal: 'Toplam Şut',
  corners: 'Korner',
  offsides: 'Ofsayt',
  fauls: 'Faul',
  yellow_cards: 'Sarı Kart',
  red_cards: 'Kırmızı Kart',
  saves: 'Kurtarış',
  shots_blocked: 'Blok',
  free_kicks: 'Serbest Vuruş',
  goal_kicks: 'Aut Atışı',
  throw_ins: 'Taç Atışı',
  dangerous_attacks: 'Tehlikeli Atak',
  attacks: 'Atak',
};

export default function MatchStats({ stats }: MatchStatsProps) {
  const renderStatBar = (homeVal: number, awayVal: number) => {
    const total = homeVal + awayVal;
    if (total === 0) return null;
    const homePct = (homeVal / total) * 100;

    return (
      <div className={styles.barContainer}>
        <div className={styles.barHome} style={{ width: `${homePct}%` }} />
        <div className={styles.barAway} style={{ width: `${100 - homePct}%` }} />
      </div>
    );
  };

  const statEntries = stats
    ? Object.entries(stats)
        .filter(([, val]) => val !== null && val !== undefined)
        .map(([key, val]) => {
          const parts = (val as string).split(':');
          return {
            key,
            label: STAT_LABELS[key] || key,
            home: parts[0]?.trim() || '0',
            away: parts[1]?.trim() || '0',
          };
        })
    : [];

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Maç İstatistikleri</h3>

      {statEntries.length === 0 ? (
        <div className={styles.empty}>İstatistik verisi bulunmuyor.</div>
      ) : (
        <div className={styles.statsList}>
          {statEntries.map((stat) => (
            <div key={stat.key} className={styles.statItem}>
              <div className={styles.statLabels}>
                <span className={styles.statValue}>{stat.home}</span>
                <span className={styles.statName}>{stat.label}</span>
                <span className={styles.statValue}>{stat.away}</span>
              </div>
              {renderStatBar(parseInt(stat.home) || 0, parseInt(stat.away) || 0)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
