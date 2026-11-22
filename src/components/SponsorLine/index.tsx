import { SPONSOR_SLOTS, type SponsorSlot } from '@/config/sponsorSlots';
import styles from './sponsorLine.module.scss';

/** "Sponsor: X katkılarıyla" satırı (büyüme raporu 3.5); slot boşsa hiçbir şey çizmez. */
export default function SponsorLine({ slot }: { slot: SponsorSlot }) {
  const s = SPONSOR_SLOTS[slot];
  if (!s) return null;
  return (
    <p className={styles.line}>
      Sponsor:{' '}
      <a href={s.url} target="_blank" rel="sponsored noopener noreferrer">
        {s.name}
      </a>
      {s.label ? ` ${s.label}` : ''}
    </p>
  );
}
