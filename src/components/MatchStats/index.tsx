import styles from './matchStats.module.scss';
import { MatchStatsData } from '@/models/domain';

interface MatchStatsProps {
  stats: MatchStatsData | null;
  odds?: {
    pre?: { '1': number; 'X': number; '2': number };
    live?: { '1': number; 'X': number; '2': number };
  } | null;
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

export default function MatchStats({ stats, odds }: MatchStatsProps) {
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

      <h3 className={styles.title} style={{ marginTop: '24px' }}>
        Maç Sonucu Oranları
      </h3>
      {odds ? (
        <div className={styles.oddsContainer}>
          <div className={styles.oddItem}>
            <span className={styles.oddLabel}>MS 1</span>
            <span className={styles.oddValue}>{odds.pre?.['1'] ?? '-'}</span>
          </div>
          <div className={styles.oddItem}>
            <span className={styles.oddLabel}>MS X</span>
            <span className={styles.oddValue}>{odds.pre?.['X'] ?? '-'}</span>
          </div>
          <div className={styles.oddItem}>
            <span className={styles.oddLabel}>MS 2</span>
            <span className={styles.oddValue}>{odds.pre?.['2'] ?? '-'}</span>
          </div>
        </div>
      ) : (
        <div className={styles.empty}>Oran bilgisi bulunamadı.</div>
      )}
    </div>
  );
}
