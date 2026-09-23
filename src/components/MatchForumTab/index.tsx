import MatchPoll from '@/components/MatchPoll';
import MatchForum from '@/components/MatchForum';
import styles from './matchForumTab.module.scss';

interface MatchForumTabProps {
  matchId: string;
}

/**
 * "Forum" sekmesinin içeriği: 1X2 anketi + maç yorumları tek kartta.
 * Bilinçli olarak alt sekme YOK — anket üstte, yorumlar altta; ikisi de kendi
 * başlığını taşıdığı için kartın ayrıca üst başlığı yoktur (sekme adı yeterli).
 */
export default function MatchForumTab({ matchId }: MatchForumTabProps) {
  return (
    <section className={styles.card}>
      <MatchPoll matchId={matchId} />
      <MatchForum matchId={matchId} />
    </section>
  );
}
