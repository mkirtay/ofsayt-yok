import { useTranslation } from '@/lib/i18n';
import MatchPoll from '@/components/MatchPoll';
import MatchForum from '@/components/MatchForum';
import styles from './matchCommunity.module.scss';

interface MatchCommunityProps {
  matchId: string;
  /** Sekme içinde: kendi kart çerçevesi ve başlığı yok (sekme başlığı yeterli). */
  embedded?: boolean;
}

/**
 * Topluluk Tahmini (1X2 anketi) + Maç Yorumları tek kartta. Bilinçli olarak sekme YOK
 * (IA'ya gereksiz karmaşıklık eklememek için) — anket üstte, yorumlar altta.
 */
export default function MatchCommunity({ matchId, embedded = false }: MatchCommunityProps) {
  const { t } = useTranslation('match');
  return (
    <section className={embedded ? styles.embedded : styles.card} aria-label={t('community.title')}>
      {embedded ? null : <h3 className={styles.title}>{t('community.title')}</h3>}
      <MatchPoll matchId={matchId} />
      <MatchForum matchId={matchId} />
    </section>
  );
}
