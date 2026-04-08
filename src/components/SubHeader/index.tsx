import { useMemo } from 'react';
import Container from '../Container';
import styles from './subHeader.module.scss';

export type MatchTab = 'all' | 'live' | 'finished' | 'favorites';

interface SubHeaderProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  activeTab: MatchTab;
  onTabChange: (tab: MatchTab) => void;
}

const TABS: { key: MatchTab; label: string }[] = [
  { key: 'all', label: 'Hepsi' },
  { key: 'live', label: 'Canlı' },
  { key: 'finished', label: 'Bitmiş' },
  { key: 'favorites', label: 'Favoriler' },
];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatTrDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
}

export default function SubHeader({
  selectedDate,
  onDateChange,
  activeTab,
  onTabChange,
}: SubHeaderProps) {
  const displayDate = useMemo(() => formatTrDate(selectedDate), [selectedDate]);

  return (
    <div className={styles.subHeader}>
      <Container className={styles.inner}>
        <div className={styles.dateNav}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => onDateChange(shiftDate(selectedDate, -1))}
            aria-label="Önceki gün"
          >
            ←
          </button>
          <div className={styles.dateBlock}>
            <span className={styles.dateLabel}>{displayDate}</span>
            <input
              type="date"
              className={styles.datePicker}
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => onDateChange(shiftDate(selectedDate, 1))}
            aria-label="Sonraki gün"
          >
            →
          </button>
        </div>

        <nav className={styles.tabs} aria-label="Maç filtresi">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={styles.sortArea}>
          <span className={styles.sortLabel}>Zamana Göre Sırala</span>
          <span className={styles.sortIcon}>☰</span>
        </div>
      </Container>
    </div>
  );
}
