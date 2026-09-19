import type { ReactNode } from 'react';
import { MatchEvent } from '@/models/domain';
import { PanelSkeleton } from '@/components/Skeleton';
import styles from './eventTimeline.module.scss';

interface EventTimelineProps {
  events: MatchEvent[];
  homeName?: string;
  awayName?: string;
  loading?: boolean;
}

/** Tek boyutlu (16×16) ikon kutusu: top / sarı / kırmızı kart / oyuncu değişikliği. */
function EventIcon({ event }: { event: string }): ReactNode {
  switch (event) {
    case 'GOAL':
      return <span className={`${styles.icon} ${styles.iconGoal}`} aria-label="Gol" role="img">⚽</span>;
    case 'YELLOW_CARD':
      return <span className={styles.icon} aria-label="Sarı kart" role="img"><i className={`${styles.card} ${styles.cardYellow}`} /></span>;
    case 'RED_CARD':
      return <span className={styles.icon} aria-label="Kırmızı kart" role="img"><i className={`${styles.card} ${styles.cardRed}`} /></span>;
    case 'SUBSTITUTION':
      return (
        <span className={`${styles.icon} ${styles.iconSub}`} aria-label="Oyuncu değişikliği" role="img">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 5.5h9M9.5 3l2.5 2.5L9.5 8" />
            <path d="M13 10.5H4M6.5 8L4 10.5 6.5 13" />
          </svg>
        </span>
      );
    default:
      return <span className={styles.icon} aria-hidden="true">•</span>;
  }
}

export default function EventTimeline({
  events,
  loading,
}: EventTimelineProps) {
  if (loading) {
    return <PanelSkeleton rows={6} />;
  }

  if (!events || events.length === 0) {
    return (
      <div className={styles.timeline}>
        <h3 className={styles.title}>Maç Olayları</h3>
        <div className={styles.empty}>Maç olayı bulunmuyor.</div>
      </div>
    );
  }

  const sortedEvents = [...events].sort((a, b) => a.time - b.time);

  return (
    <div className={styles.timeline}>
      <h3 className={styles.title}>Maç Olayları</h3>
      <ol className={styles.events}>
        {sortedEvents.map((event, index) => {
          const name = event.player?.name || '';
          const side = (
            <>
              <span className={styles.player} title={name}>{name}</span>
              <EventIcon event={event.event} />
            </>
          );
          return (
            <li key={`${event.id}-${index}`} className={styles.eventRow}>
              <div className={styles.homeCell}>{event.is_home ? side : null}</div>
              <span className={styles.minute}>{event.time}&apos;</span>
              <div className={styles.awayCell}>
                {event.is_home ? null : (
                  <>
                    <EventIcon event={event.event} />
                    <span className={styles.player} title={name}>{name}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
