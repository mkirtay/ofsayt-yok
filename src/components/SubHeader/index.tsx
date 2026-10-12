import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  buildDateStripWindow,
  isoDayOfMonth,
  MOBILE_STRIP_RADIUS,
  shiftIsoDate,
  stripHasToday,
  todayIsoIstanbul,
} from '@/utils/dateStrip';
import { useTranslation, useI18n } from '@/lib/i18n';
import { useHideOnScroll } from '@/hooks/useHideOnScroll';
import Container from '../Container';

/**
 * Takvim (react-datepicker + date-fns + kendi CSS'i, ~57 KB gzip JS + render-blocking CSS) yalnızca açılınca gerekir:
 * ayrı chunk. Tetikleyiciye dokunma/üzerine gelme anında önceden indirilir; açılışta gecikme hissedilmez.
 */
const loadCalendar = () => import('./Calendar');
const Calendar = dynamic(loadCalendar, { ssr: false });
import styles from './subHeader.module.scss';

export type MatchTab = 'all' | 'live' | 'finished' | 'favorites';

interface SubHeaderProps {
  /**
   * Sayfa sunucuda bir günle üretildiyse (ana sayfa ISR) şerit ve takvim rozeti ilk render'da bu günle çizilir —
   * mount'ı beklemek şeridi sonradan ekleyip altındaki her şeyi ~53 px itiyordu (CLS). Mount'ta gerçek gün alınır.
   */
  initialTodayIso?: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  activeTab: MatchTab;
  onTabChange: (tab: MatchTab) => void;
}

export default function SubHeader({
  initialTodayIso,
  selectedDate,
  onDateChange,
  activeTab,
  onTabChange,
}: SubHeaderProps) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  // Mobil: aşağı kaydırınca logo bandı gizlenir, gün şeridi yapışık kalır (yalnız transform).
  useHideOnScroll();
  const dateLocale = locale === 'en' ? 'en-GB' : 'tr-TR';

  const displayDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString(dateLocale, {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    });
  }, [selectedDate, dateLocale]);

  // Takvim iki yerden açılır: masaüstünde tarih satırı, mobilde şeridin son hücresi (hangisiyse panel onun yanında).
  const [calendarFrom, setCalendarFrom] = useState<'nav' | 'strip' | null>(null);
  const calendarOpen = calendarFrom === 'nav';
  const triggerRef = useRef<HTMLDivElement>(null);
  const stripCalendarRef = useRef<HTMLButtonElement>(null);
  const toggleCalendar = (from: 'nav' | 'strip') => setCalendarFrom((v) => (v === from ? null : from));
  const selectFromCalendar = (date: string) => {
    onDateChange(date);
    setCalendarFrom(null);
  };

  // Bugünün tarihi mount'ta çözülür (statik prerender'da bayat gün / hydration uyuşmazlığı olmasın); sunucunun
  // ürettiği gün verildiyse ilk render onunla (sunucu = istemci).
  const [todayIso, setTodayIso] = useState<string | null>(initialTodayIso ?? null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bugünün tarihi yalnız istemcide çözülür (statik prerender/hydration uyumu); harici sistem (saat) okuması
    setTodayIso(todayIsoIstanbul());
    // Gece yarısını geçen açık sekmede rozet/şerit de güncellensin
    const id = setInterval(() => setTodayIso(todayIsoIstanbul()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Mobil şerit bugün ±30 gün, yatay kaydırılır (bkz. MOBILE_STRIP_RADIUS); seçili gün pencere dışındaysa (takvimden)
  // pencere o güne kayar. Kaydırmak yalnız görünümü değiştirir; veri yalnız gün SEÇİLİNCE (onDateChange) çekilir.
  const strip = useMemo(
    () => (todayIso ? buildDateStripWindow(todayIso, selectedDate, MOBILE_STRIP_RADIUS) : []),
    [todayIso, selectedDate],
  );
  // Seçili gün bugün değilse "Bugün" kısayolu (bugün pencerede olsa da kaydırılıp görünmez olabilir).
  const showTodayShortcut = strip.length > 0 && todayIso != null && (selectedDate !== todayIso || !stripHasToday(strip));
  const stripRef = useRef<HTMLDivElement>(null);
  const centeredOnce = useRef(false);
  useEffect(() => {
    // Seçili gün şeritte ortalansın — yalnız yatay kaydırma (scrollIntoView sayfayı dikeyde de oynatabiliyordu). İlk
    // konumlama anında; sonraki gün değişimlerinde yumuşak (hareketi azalt açıksa anında).
    const box = stripRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const smooth = centeredOnce.current && !prefersReducedMotion();
    centeredOnce.current = true;
    box.scrollTo?.({ left: centeredScrollLeft(box, el), behavior: smooth ? 'smooth' : 'auto' });
  }, [strip, showTodayShortcut]);
  // Klavye: şerit tek sekme durağı (seçili gün); ←/→ önceki/sonraki güne odak, Home/End uçlara. Enter/Space seçer.
  const onStripKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.min(items.length - 1, Math.max(0, (i < 0 ? 0 : i) + (e.key === 'ArrowLeft' ? -1 : 1)));
    e.preventDefault();
    items[next]?.focus({ preventScroll: true });
    const box = stripRef.current;
    const el = items[next];
    if (box && el) box.scrollTo?.({ left: centeredScrollLeft(box, el), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
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
              onClick={() => toggleCalendar('nav')}
              onPointerEnter={() => void loadCalendar()}
              onFocus={() => void loadCalendar()}
              onTouchStart={() => void loadCalendar()}
              role="button"
              tabIndex={0}
              aria-expanded={calendarOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleCalendar('nav');
              }}
            >
              <span className={styles.dateLabel}>{displayDate}</span>
              <CalendarIcon todayIso={todayIso} testId="calendar-day-badge" />
            </div>
            {calendarOpen && (
              <Calendar
                selectedDate={selectedDate}
                onSelect={selectFromCalendar}
                onClose={() => setCalendarFrom(null)}
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
              data-tab={tab.key}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </Container>

      {/* Mobil (< 1024): tek satır — [Bugün kısayolu] gün şeridi [takvim]. Tarih satırı ve sekmeler mobilde gizli
          (durum çipleri lig çipleriyle aynı satırda, bkz. MatchHubPage). */}
      {strip.length > 0 && (
        <Container className={styles.stripWrap}>
          {showTodayShortcut ? (
            <button
              type="button"
              className={styles.stripToday}
              onClick={() => todayIso && onDateChange(todayIso)}
              aria-label={t('subHeader.backToToday')}
            >
              {t('subHeader.today')}
            </button>
          ) : null}
          <div className={styles.dateStrip} ref={stripRef} role="tablist" aria-label={t('subHeader.dayStrip')} onKeyDown={onStripKeyDown}>
            {strip.map((d) => (
              <button
                key={d.iso}
                type="button"
                role="tab"
                tabIndex={d.isSelected ? 0 : -1}
                aria-selected={d.isSelected}
                aria-current={d.isSelected ? 'date' : undefined}
                data-iso={d.iso}
                className={`${styles.stripItem} ${d.isSelected ? styles.stripItemActive : ''}`}
                onClick={() => onDateChange(d.iso)}
              >
                <span className={styles.stripWeekday}>{d.isToday ? t('subHeader.today') : weekdayFmt.format(new Date(`${d.iso}T12:00:00Z`))}</span>
                <span className={styles.stripDay}>{d.day}</span>
              </button>
            ))}
          </div>
          <div className={styles.stripCalendarWrap}>
            <button
              ref={stripCalendarRef}
              type="button"
              className={styles.stripCalendar}
              aria-label={t('subHeader.openCalendar')}
              aria-haspopup="dialog"
              aria-expanded={calendarFrom === 'strip'}
              onClick={() => toggleCalendar('strip')}
              onPointerEnter={() => void loadCalendar()}
              onFocus={() => void loadCalendar()}
              onTouchStart={() => void loadCalendar()}
            >
              <CalendarIcon todayIso={todayIso} />
            </button>
            {calendarFrom === 'strip' && (
              <Calendar
                selectedDate={selectedDate}
                onSelect={selectFromCalendar}
                onClose={() => setCalendarFrom(null)}
                anchorRef={stripCalendarRef}
              />
            )}
          </div>
        </Container>
      )}
    </div>
  );
}

/**
 * Hücreyi şeritte ortalayan scrollLeft. `offsetLeft` KULLANILMAZ: o en yakın konumlu ataya (`.stripWrap`) göredir ve solda
 * "Bugün" kısayolu varken onun genişliği kadar kayıyordu; şeride göre konum dikdörtgenlerden hesaplanır.
 */
function centeredScrollLeft(box: HTMLElement, el: HTMLElement): number {
  const offset = el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
  return offset - (box.clientWidth - el.clientWidth) / 2;
}

/** Hareketi azalt tercihi (sunucuda / matchMedia yoksa false). */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Takvim ikonu + içinde bugünün günü (mount'a kadar boş — statik prerender'da bayat gün olmasın). */
function CalendarIcon({ todayIso, testId }: { todayIso: string | null; testId?: string }) {
  return (
    <span className={styles.calendarIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4.5" width="18" height="16" rx="3" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
      <span className={styles.calendarBadge} data-testid={testId}>
        {todayIso ? isoDayOfMonth(todayIso) : ''}
      </span>
    </span>
  );
}
