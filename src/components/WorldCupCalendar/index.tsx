import { useEffect, useRef, useState } from 'react';
import type { Match } from '@/models/liveScore';
import { utcTimeToTr } from '@/utils/dateFormat';
import styles from './calendar.module.scss';

type ViewMode = 'month' | 'list';

type RoundKey = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final';

const ROUND_CONFIG: Record<RoundKey, { label: string; bg: string }> = {
  group: { label: 'Group Stage', bg: '#3B82F6' },
  r32:   { label: 'R32',         bg: '#F97316' },
  r16:   { label: 'R16',         bg: '#EAB308' },
  qf:    { label: 'QF',          bg: '#8B5CF6' },
  sf:    { label: 'SF',          bg: '#EF4444' },
  final: { label: 'Final',       bg: '#F59E0B' },
};

const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAY_LABELS = ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT'];

function getRoundKey(match: Match): RoundKey {
  const r = (match.round ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!r) return 'group';
  if (r === '1/16' || r === 'R32') return 'r32';
  if (r === '1/8' || r === 'R16') return 'r16';
  if (r === '1/4' || r === 'QF') return 'qf';
  if (r === '1/2' || r === 'SF') return 'sf';
  if (r === 'F' || r === 'FINAL') return 'final';
  return 'group';
}

function matchTime(m: Match): string {
  const raw = m.scheduled ?? m.time ?? '';
  return utcTimeToTr(raw, m.date);
}

/**
 * Varsayılan ay: bugün veya sonrasındaki ilk maçın ayı (turnuva devam ediyorsa/başlamadıysa);
 * yoksa (turnuva bitmişse) en son oynanan maçın ayı; hiç maç yoksa gerçek "bugün".
 */
function pickDefaultMonth(matches: Match[]): { year: number; month: number } {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const dated = matches
    .map((m) => (m.date ?? '').trim().slice(0, 10))
    .filter((d) => d.length === 10)
    .sort();
  const upcoming = dated.find((d) => d >= todayIso);
  const chosen = upcoming ?? dated[dated.length - 1];
  if (chosen) {
    const [y, mo] = chosen.split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(mo)) {
      return { year: y, month: mo - 1 };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function groupByDate(matches: Match[]): Map<string, Match[]> {
  const map = new Map<string, Match[]>();
  for (const m of matches) {
    const d = (m.date ?? '').trim().slice(0, 10);
    if (!d) continue;
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(m);
  }
  return map;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year: number, month: number) {
  // 0=Sun → returns 0=Sun,1=Mon,...,6=Sat
  return new Date(year, month, 1).getDay();
}

function toIcsDt(date: string, time: string) {
  const [y, mo, d] = date.split('-');
  const [h, mi] = time.replace(':', '').padEnd(4, '0').split('');
  const hh = (time.split(':')[0] ?? '00').padStart(2, '0');
  const mm = (time.split(':')[1] ?? '00').padStart(2, '0');
  return `${y}${mo}${d}T${hh}${mm}00Z`;
}

function generateIcs(match: Match): string {
  const date = match.date ?? '';
  const time = matchTime(match) || '00:00';
  const [h] = time.split(':');
  const endH = String(Math.min(23, (parseInt(h ?? '0') + 2))).padStart(2, '0');
  const endTime = `${endH}:${time.split(':')[1] ?? '00'}`;
  const title = `${match.home?.name ?? '?'} v ${match.away?.name ?? '?'} - FIFA World Cup 2026`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OfsaytYok//WC2026//TR',
    'BEGIN:VEVENT',
    `UID:wcmatch-${match.id}@ofsaytyok.app`,
    `DTSTART:${toIcsDt(date, time)}`,
    `DTEND:${toIcsDt(date, endTime)}`,
    `SUMMARY:${title}`,
    `LOCATION:${match.location ?? ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(match: Match) {
  const blob = new Blob([generateIcs(match)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wc2026-${match.id}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function googleCalUrl(match: Match): string {
  const date = match.date ?? '';
  const time = matchTime(match) || '00:00';
  const [h] = time.split(':');
  const endH = String(Math.min(23, parseInt(h ?? '0') + 2)).padStart(2, '0');
  const endTime = `${endH}:${time.split(':')[1] ?? '00'}`;
  const start = toIcsDt(date, time);
  const end = toIcsDt(date, endTime);
  const text = encodeURIComponent(`${match.home?.name ?? '?'} v ${match.away?.name ?? '?'} - FIFA World Cup 2026`);
  const loc = encodeURIComponent(match.location ?? '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&location=${loc}`;
}

function outlookCalUrl(match: Match): string {
  const date = match.date ?? '';
  const time = matchTime(match) || '00:00';
  const [h] = time.split(':');
  const endH = String(Math.min(23, parseInt(h ?? '0') + 2)).padStart(2, '0');
  const endTime = `${endH}:${time.split(':')[1] ?? '00'}`;
  const subject = encodeURIComponent(`${match.home?.name ?? '?'} v ${match.away?.name ?? '?'} - FIFA World Cup 2026`);
  const location = encodeURIComponent(match.location ?? '');
  const startdt = encodeURIComponent(`${date}T${time}:00`);
  const enddt = encodeURIComponent(`${date}T${endTime}:00`);
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${subject}&startdt=${startdt}&enddt=${enddt}&location=${location}`;
}

// ---- Match Detail Modal ----
function MatchModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const [calOpen, setCalOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const rk = getRoundKey(match);
  const cfg = ROUND_CONFIG[rk];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setCalOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose} aria-label="Kapat">✕</button>

        <div className={styles.modalStage}>
          <span className={styles.stageBadge} style={{ background: cfg.bg }}>{cfg.label}</span>
        </div>

        <div className={styles.modalTeams}>
          <div className={styles.modalTeam}>
            {match.home?.logo && (
              <img src={match.home.logo} alt="" width={32} height={32} className={styles.modalTeamLogo} />
            )}
            <span className={styles.modalTeamName}>{match.home?.name ?? '?'}</span>
          </div>
          <span className={styles.modalVs}>vs</span>
          <div className={styles.modalTeam}>
            {match.away?.logo && (
              <img src={match.away.logo} alt="" width={32} height={32} className={styles.modalTeamLogo} />
            )}
            <span className={styles.modalTeamName}>{match.away?.name ?? '?'}</span>
          </div>
        </div>

        {(match.scores?.ft_score || match.scores?.score || match.score) && (
          <div className={styles.modalScore}>
            {match.scores?.ft_score || match.scores?.score || match.score}
          </div>
        )}

        <div className={styles.modalMeta}>
          {match.date && (
            <div className={styles.modalMetaRow}>
              <span className={styles.modalMetaIcon}>📅</span>
              <span>{new Date(match.date + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
          {matchTime(match) && (
            <div className={styles.modalMetaRow}>
              <span className={styles.modalMetaIcon}>⏰</span>
              <span>{matchTime(match)}</span>
            </div>
          )}
          {match.location && (
            <div className={styles.modalMetaRow}>
              <span className={styles.modalMetaIcon}>📍</span>
              <span>{match.location}</span>
            </div>
          )}
        </div>

        <div className={styles.calendarDropWrapper} ref={dropRef}>
          <button
            className={styles.calendarBtn}
            onClick={() => setCalOpen((v) => !v)}
          >
            📆 Takvime Ekle ▾
          </button>
          {calOpen && (
            <div className={styles.calendarDrop}>
              <a href={googleCalUrl(match)} target="_blank" rel="noopener noreferrer" className={styles.calendarDropItem}>
                🟢 Google Calendar
              </a>
              <a href={outlookCalUrl(match)} target="_blank" rel="noopener noreferrer" className={styles.calendarDropItem}>
                🔵 Outlook
              </a>
              <button
                className={styles.calendarDropItem}
                onClick={() => { downloadIcs(match); setCalOpen(false); }}
              >
                🔴 .ics İndir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Month Grid ----
function MonthGrid({
  year,
  month,
  byDate,
  onSelect,
}: {
  year: number;
  month: number;
  byDate: Map<string, Match[]>;
  onSelect: (m: Match) => void;
}) {
  const numDays = daysInMonth(year, month);
  const startDay = firstWeekday(year, month); // 0=Sun

  // Build grid cells: prefix empty + days
  const cells: Array<{ day: number | null }> = [];
  // Convert Sun=0 → Mon=0 for display
  const offset = startDay === 0 ? 6 : startDay - 1;
  for (let i = 0; i < offset; i++) cells.push({ day: null });
  for (let d = 1; d <= numDays; d++) cells.push({ day: d });

  const MAX_VISIBLE = 3;

  return (
    <div className={styles.grid}>
      <div className={styles.gridHeader}>
        {DAY_LABELS.map((d) => (
          <div key={d} className={styles.gridHeaderCell}>{d}</div>
        ))}
      </div>
      <div className={styles.gridBody}>
        {cells.map((cell, idx) => {
          if (!cell.day) return <div key={`empty-${idx}`} className={styles.gridCell} />;

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
          const dayMatches = byDate.get(dateStr) ?? [];
          const visible = dayMatches.slice(0, MAX_VISIBLE);
          const extra = dayMatches.length - MAX_VISIBLE;

          return (
            <div key={dateStr} className={styles.gridCell}>
              <span className={styles.gridDayNum}>{cell.day}</span>
              {visible.map((m) => {
                const rk = getRoundKey(m);
                const cfg = ROUND_CONFIG[rk];
                return (
                  <button
                    key={m.id}
                    className={styles.matchPill}
                    style={{ background: cfg.bg }}
                    onClick={() => onSelect(m)}
                    title={`${m.home?.name ?? '?'} v ${m.away?.name ?? '?'}`}
                  >
                    {matchTime(m)} {(m.home?.name ?? '?').slice(0, 3)} v {(m.away?.name ?? '?').slice(0, 3)}
                  </button>
                );
              })}
              {extra > 0 && (
                <button
                  className={styles.moreChip}
                  onClick={() => dayMatches[MAX_VISIBLE] && onSelect(dayMatches[MAX_VISIBLE])}
                >
                  +{extra} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- List View ----
function ListView({
  year,
  month,
  byDate,
  onSelect,
}: {
  year: number;
  month: number;
  byDate: Map<string, Match[]>;
  onSelect: (m: Match) => void;
}) {
  const numDays = daysInMonth(year, month);
  const rows: Array<{ date: string; matches: Match[] }> = [];
  for (let d = 1; d <= numDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const ms = byDate.get(dateStr) ?? [];
    if (ms.length > 0) rows.push({ date: dateStr, matches: ms });
  }

  if (!rows.length) return <p className={styles.listEmpty}>Bu ay maç bulunamadı.</p>;

  return (
    <div className={styles.listView}>
      {rows.map(({ date, matches }) => (
        <div key={date} className={styles.listDay}>
          <div className={styles.listDateLabel}>
            {new Date(date + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {matches.map((m) => {
            const rk = getRoundKey(m);
            const cfg = ROUND_CONFIG[rk];
            return (
              <button
                key={m.id}
                className={styles.listMatchRow}
                onClick={() => onSelect(m)}
              >
                <span className={styles.listStageDot} style={{ background: cfg.bg }} />
                <span className={styles.listTime}>{matchTime(m)}</span>
                <span className={styles.listTeams}>
                  {m.home?.name ?? '?'} — {m.away?.name ?? '?'}
                </span>
                {(m.scores?.ft_score || m.score) && (
                  <span className={styles.listScore}>{m.scores?.ft_score || m.score}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---- Main Calendar Component ----
type Props = {
  matches: Match[];
};

export default function WorldCupCalendar({ matches }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const autoPickedRef = useRef(false);

  useEffect(() => {
    if (autoPickedRef.current || matches.length === 0) return;
    autoPickedRef.current = true;
    const picked = pickDefaultMonth(matches);
    setYear(picked.year);
    setMonth(picked.month);
  }, [matches]);

  const byDate = groupByDate(matches);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.title}>Takvim</h2>
        <div className={styles.controls}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'month' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('month')}
            >
              📅 Ay
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('list')}
            >
              ≡ Liste
            </button>
          </div>
          <div className={styles.monthNav}>
            <button className={styles.navBtn} onClick={prevMonth}>‹</button>
            <span className={styles.monthLabel}>{MONTH_NAMES[month]} {year}</span>
            <button className={styles.navBtn} onClick={nextMonth}>›</button>
          </div>
        </div>
      </div>

      {viewMode === 'month' ? (
        <MonthGrid year={year} month={month} byDate={byDate} onSelect={setSelectedMatch} />
      ) : (
        <ListView year={year} month={month} byDate={byDate} onSelect={setSelectedMatch} />
      )}

      <div className={styles.legend}>
        {Object.entries(ROUND_CONFIG).map(([key, cfg]) => (
          <span key={key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: cfg.bg }} />
            {cfg.label}
          </span>
        ))}
      </div>

      {selectedMatch && (
        <MatchModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />
      )}
    </div>
  );
}
