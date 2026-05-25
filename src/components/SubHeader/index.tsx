import { useMemo, useState } from 'react';
import { useTranslation, useI18n } from '@/lib/i18n';
import Container from '../Container';
import Calendar from './Calendar';
import styles from './subHeader.module.scss';

export type MatchTab = 'all' | 'live' | 'finished' | 'favorites';

interface SubHeaderProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  activeTab: MatchTab;
  onTabChange: (tab: MatchTab) => void;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SubHeader({
  selectedDate,
  onDateChange,
  activeTab,
  onTabChange,
}: SubHeaderProps) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-GB' : 'tr-TR';

  const displayDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString(dateLocale, {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    });
  }, [selectedDate, dateLocale]);

  const [calendarOpen, setCalendarOpen] = useState(false);

  const tabs: { key: MatchTab; label: string }[] = [
    { key: 'all', label: t('subHeader.all') },
    { key: 'live', label: t('subHeader.live') },
    { key: 'finished', label: t('subHeader.finished') },
    { key: 'favorites', label: t('subHeader.favorites') },
  ];

  return (
    <div className={styles.subHeader}>
      <Container className={styles.inner}>
        <div className={styles.dateNav}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => onDateChange(shiftDate(selectedDate, -1))}
            aria-label={t('subHeader.prevDay')}
          >
            ←
          </button>
          <div
            className={styles.dateBlock}
            onClick={() => setCalendarOpen((v) => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setCalendarOpen((v) => !v);
            }}
          >
            <span className={styles.dateLabel}>{displayDate}</span>
            <span className={styles.calendarIcon}>📅</span>
            {calendarOpen && (
              <Calendar
                selectedDate={selectedDate}
                onSelect={(date) => {
                  onDateChange(date);
                  setCalendarOpen(false);
                }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => onDateChange(shiftDate(selectedDate, 1))}
            aria-label={t('subHeader.nextDay')}
          >
            →
          </button>
        </div>

        <nav className={styles.tabs} aria-label={t('subHeader.matchFilter')}>
          {tabs.map((tab) => (
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
          <span className={styles.sortLabel}>{t('subHeader.sortByTime')}</span>
          <span className={styles.sortIcon}>☰</span>
        </div>
      </Container>
    </div>
  );
}
