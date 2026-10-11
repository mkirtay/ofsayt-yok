import MatchPoll from '@/components/MatchPoll';
import MatchForum from '@/components/MatchForum';
import styles from './matchForumTab.module.scss';

interface MatchForumTabProps {
  matchId: string;
  /** Anket kilitli (maç başladı/bitti); bkz. utils/matchPollLock.ts. */
  pollLocked?: boolean;
}

/**
 * "Forum" sekmesinin içeriği: 1X2 anketi + maç yorumları tek kartta.
 * Bilinçli olarak alt sekme YOK — anket üstte, yorumlar altta; ikisi de kendi
 * başlığını taşıdığı için kartın ayrıca üst başlığı yoktur (sekme adı yeterli).
 */
export default function MatchForumTab({ matchId, pollLocked = false }: MatchForumTabProps) {
  return (
    <section className={styles.card}>
      <MatchPoll matchId={matchId} locked={pollLocked} />
      <MatchForum matchId={matchId} />
    </section>
  );
}
