import { MatchEvent } from '@/models/domain';
import styles from './eventTimeline.module.scss';

interface EventTimelineProps {
  events: MatchEvent[];
  homeName?: string;
  awayName?: string;
}

const EVENT_ICONS: Record<string, string> = {
  GOAL: '⚽',
  YELLOW_CARD: '🟨',
  RED_CARD: '🟥',
  SUBSTITUTION: '🔄',
};

export default function EventTimeline({ events, homeName = 'Ev Sahibi', awayName = 'Deplasman' }: EventTimelineProps) {
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
      <div className={styles.events}>
        {sortedEvents.map((event, index) => {
          const isHome = event.is_home;
          const playerName = event.player?.name || '';
          const icon = EVENT_ICONS[event.event] || '📋';

          return (
            <div
              key={`${event.id}-${index}`}
              className={`${styles.eventRow} ${isHome ? styles.homeEvent : styles.awayEvent}`}
            >
              {isHome && (
                <div className={styles.leftSide}>
                  <span className={styles.player}>{playerName}</span>
                  <span className={styles.icon}>{icon}</span>
                </div>
              )}
              <div className={styles.minute}>{event.time}'</div>
              {!isHome && (
                <div className={styles.rightSide}>
                  <span className={styles.icon}>{icon}</span>
                  <span className={styles.player}>{playerName}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
