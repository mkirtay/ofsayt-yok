import type { Event } from "@/models/domain";
import styles from "./eventTimeline.module.scss";

interface EventTimelineProps {
  events: Event[];
}

export default function EventTimeline({ events }: EventTimelineProps) {
  if (events.length === 0) {
    return <p className={styles.empty}>Henüz olay yok.</p>;
  }

  return (
    <ul className={styles.timeline}>
      {events.map((event, index) => (
        <li key={`${event.type}-${event.minute}-${index}`} className={styles.item}>
          <span className={styles.minute}>{event.minute}&apos;</span>
          <span className={styles.type}>{event.type}</span>
          <span className={styles.player}>{event.playerName}</span>
        </li>
      ))}
    </ul>
  );
}
