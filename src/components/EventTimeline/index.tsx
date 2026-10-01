import type { ReactNode } from 'react';
import { MatchEvent } from '@/models/domain';
import { PanelSkeleton } from '@/components/Skeleton';
import { useTranslation } from '@/lib/i18n';
import styles from './eventTimeline.module.scss';

interface EventTimelineProps {
  events: MatchEvent[];
  homeName?: string;
  awayName?: string;
  loading?: boolean;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

const VAR_EVENTS = new Set(['VAR', 'VAR_CARD']);

/** Top: daire + ortada dolu beşgen + kenara uzanan dikişler. Renk `currentColor`'dan (açık/koyu tema). */
function BallSvg() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 5.3l2.5 1.8-.95 2.95h-3.1L5.5 7.1z" fill="currentColor" />
      <path d="M8 5.3V1.6M10.5 7.1l3.5-1.1M9.55 10.05l2.15 3M6.45 10.05l-2.15 3M5.5 7.1L2 6" />
    </svg>
  );
}

/** Kale çerçevesi (direkler + file) içinde top; `crossed` = kaçan penaltı için çapraz çizgi. */
function GoalFrameSvg({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 13.5V3h13v10.5" />
      <path d="M1.5 6.5h13M5.75 3v3.5M10.25 3v3.5" strokeWidth="0.7" opacity="0.6" />
      <circle cx="8" cy="10.6" r="2.3" fill="currentColor" stroke="none" />
      {crossed && <path d="M2.5 14.5L13.5 1.5" strokeWidth="1.6" />}
    </svg>
  );
}

function YellowRedCardSvg() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="2.5" y="1" width="7.5" height="10.5" rx="1.5" className={styles.fillYellow} />
      <rect x="6" y="4.5" width="7.5" height="10.5" rx="1.5" className={styles.fillRed} />
    </svg>
  );
}

/** Küçük ekran (TV): çerçeve + ayak. Yanında "VAR" rozeti durur — 16px içinde yazı okunmaz. */
function VarScreenSvg() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M8 11.5v2.5M5 14h6" />
    </svg>
  );
}

/**
 * İkon kutusu (+ varsa yanında rozet). Etiket `aria-label` + `title` olarak aynı (tooltip masaüstü için;
 * mobilde görünen bilgi satırı ayrı — bkz. `varDetail`).
 */
function EventIcon({ event, t }: { event: string; t: T }): ReactNode {
  const wrap = (label: string, icon: ReactNode, className = '', badge?: string) => (
    <span className={`${styles.iconGroup} ${className}`} role="img" aria-label={label} title={label}>
      <span className={styles.icon}>{icon}</span>
      {badge && <span className={styles.badge} aria-hidden="true">{badge}</span>}
    </span>
  );

  switch (event) {
    case 'GOAL':
      return wrap(t('events.types.goal'), <BallSvg />);
    case 'PENALTY':
      return wrap(t('events.types.penalty'), <GoalFrameSvg />, '', t('events.badges.penalty'));
    case 'MISSED_PENALTY':
      return wrap(t('events.types.missedPenalty'), <GoalFrameSvg crossed />, styles.muted);
    case 'OWN_GOAL':
      return wrap(t('events.types.ownGoal'), <BallSvg />, styles.ownGoal, t('events.badges.ownGoal'));
    case 'YELLOW_CARD':
      return wrap(t('events.types.yellowCard'), <i className={`${styles.card} ${styles.cardYellow}`} />);
    case 'RED_CARD':
      return wrap(t('events.types.redCard'), <i className={`${styles.card} ${styles.cardRed}`} />);
    case 'YELLOW_RED_CARD':
      return wrap(t('events.types.yellowRedCard'), <YellowRedCardSvg />);
    case 'VAR':
    case 'VAR_CARD':
      return wrap(t('events.types.var'), <VarScreenSvg />, styles.var, t('events.badges.var'));
    case 'SUBSTITUTION':
      return wrap(
        t('events.types.substitution'),
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5.5h9M9.5 3l2.5 2.5L9.5 8" />
          <path d="M13 10.5H4M6.5 8L4 10.5 6.5 13" />
        </svg>,
        styles.sub,
      );
    default:
      return <span className={styles.icon} aria-hidden="true">•</span>;
  }
}

/**
 * VAR kararı (Sportmonks `addition`, eski kayıtlarda `info`) → "VAR: Penaltı verildi".
 * Sözlükte olmayan değer olduğu gibi gösterilir ("VAR: Some new decision").
 */
function varDetail(event: MatchEvent, t: T): string | null {
  if (!VAR_EVENTS.has(event.event)) return null;
  const raw = (event.addition || event.info || '').trim();
  if (!raw) return null;
  const key = `events.varDecisions.${raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  const translated = t(key);
  return t('events.varDetail', { decision: translated === key ? raw : translated });
}

export default function EventTimeline({
  events,
  loading,
}: EventTimelineProps) {
  const { t } = useTranslation('match');

  if (loading) {
    return <PanelSkeleton rows={6} />;
  }

  if (!events || events.length === 0) {
    return (
      <div className={styles.timeline}>
        <h3 className={styles.title}>{t('events.title')}</h3>
        <div className={styles.empty}>{t('events.empty')}</div>
      </div>
    );
  }

  const sortedEvents = [...events].sort((a, b) => a.time - b.time);

  return (
    <div className={styles.timeline}>
      <h3 className={styles.title}>{t('events.title')}</h3>
      <ol className={styles.events}>
        {sortedEvents.map((event, index) => {
          const name = event.player?.name || '';
          const detail = varDetail(event, t);
          const text = (
            <span className={styles.text}>
              <span className={styles.player} title={name}>{name}</span>
              {detail && <span className={styles.detail}>{detail}</span>}
            </span>
          );
          const icon = <EventIcon event={event.event} t={t} />;
          return (
            <li key={`${event.id}-${index}`} className={styles.eventRow}>
              <div className={styles.homeCell}>{event.is_home ? <>{text}{icon}</> : null}</div>
              <span className={styles.minute}>{event.time}&apos;</span>
              <div className={styles.awayCell}>{event.is_home ? null : <>{icon}{text}</>}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
