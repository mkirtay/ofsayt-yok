import { useRouter } from 'next/router';
import GundemPanel from '@/components/GundemPanel';
import { useTranslation } from '@/lib/i18n';
import styles from './matchForum.module.scss';

interface MatchForumProps {
  matchId: string;
}

/**
 * Maç forumu = bu maça bağlı Gündem postları (`scope=match&matchId`). Buradan yazılan post otomatik `matchId` alır ve
 * Gündem'de maç rozetiyle görünür; yanıtlar `/gundem/{id}`'de. Eski `MatchComment` verisi taşınmadı (salt-okunur tablo).
 */
export default function MatchForum({ matchId }: MatchForumProps) {
  const router = useRouter();
  const { t } = useTranslation('match');
  return (
    <div className={styles.container}>
      <h4 className={styles.title}>{t('forum.title')}</h4>
      <GundemPanel
        scope="match"
        matchId={matchId}
        composer="post-inline"
        composerPlaceholder={t('forum.placeholder')}
        emptyText={t('forum.empty')}
        onOpenPost={(postId) => void router.push(`/gundem/${postId}`)}
      />
    </div>
  );
}
