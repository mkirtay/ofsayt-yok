import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDateStripWithSelected, isoDayOfMonth, shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';
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
  const triggerRef = useRef<HTMLDivElement>(null);

  // Bugünün tarihi mount'ta çözülür (statik prerender'da bayat gün / hydration uyuşmazlığı olmasın).
  const [todayIso, setTodayIso] = useState<string | null>(null);
  useEffect(() => {
    setTodayIso(todayIsoIstanbul());
    // Gece yarısını geçen açık sekmede rozet/şerit de güncellensin
    const id = setInterval(() => setTodayIso(todayIsoIstanbul()), 60_000);
    return () => clearInterval(id);
  }, []);

  const strip = useMemo(
    () => (todayIso ? buildDateStripWithSelected(todayIso, selectedDate) : []),
    [todayIso, selectedDate],
  );
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Seçili gün şeritte ortalansın
    const el = stripRef.current?.querySelector<HTMLElement>('[aria-current="date"]');
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [strip]);
  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(dateLocale, { weekday: 'short', timeZone: 'UTC' }),
    [dateLocale],
  );

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
            onClick={() => onDateChange(shiftIsoDate(selectedDate, -1))}
            aria-label={t('subHeader.prevDay')}
          >
            ←
          </button>
          {/* Takvim tetikleyicinin KARDEŞİ: içindeki tıklama/tuşlar tetikleyicinin toggle'ına kabarmasın
              (ay okları takvimi kapatıyordu). Konumlandırma bu sarmalayıcıya göre. */}
          <div className={styles.datePicker}>
            <div
              ref={triggerRef}
              className={styles.dateBlock}
              onClick={() => setCalendarOpen((v) => !v)}
              role="button"
              tabIndex={0}
              aria-expanded={calendarOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCalendarOpen((v) => !v);
              }}
            >
              <span className={styles.dateLabel}>{displayDate}</span>
              <span className={styles.calendarIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="18" height="16" rx="3" />
                  <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                </svg>
                {/* Gerçek güncel gün (sabit değil): mount'a kadar boş */}
                <span className={styles.calendarBadge} data-testid="calendar-day-badge">
                  {todayIso ? isoDayOfMonth(todayIso) : ''}
                </span>
              </span>
            </div>
            {calendarOpen && (
              <Calendar
                selectedDate={selectedDate}
                onSelect={(date) => {
                  onDateChange(date);
                  setCalendarOpen(false);
                }}
                onClose={() => setCalendarOpen(false)}
                anchorRef={triggerRef}
              />
            )}
          </div>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => onDateChange(shiftIsoDate(selectedDate, 1))}
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
      </Container>

      {/* Mobil: yatay kaydırmalı bugün ±2 günlük şerit (ok+tarih navigasyonuna EK) */}
      {strip.length > 0 && (
        <Container className={styles.stripWrap}>
          <div className={styles.dateStrip} ref={stripRef} role="tablist" aria-label={t('subHeader.dayStrip')}>
            {strip.map((d) => (
              <button
                key={d.iso}
                type="button"
                role="tab"
                aria-selected={d.isSelected}
                aria-current={d.isSelected ? 'date' : undefined}
                className={`${styles.stripItem} ${d.isSelected ? styles.stripItemActive : ''}`}
                onClick={() => onDateChange(d.iso)}
              >
                <span className={styles.stripWeekday}>{d.isToday ? t('subHeader.today') : weekdayFmt.format(new Date(`${d.iso}T12:00:00Z`))}</span>
                <span className={styles.stripDay}>{d.day}</span>
              </button>
            ))}
          </div>
        </Container>
      )}
    </div>
  );
}
