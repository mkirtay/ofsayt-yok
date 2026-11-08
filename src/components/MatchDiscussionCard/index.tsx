import { useGundemFeed } from '@/hooks/useGundem';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { useTranslation } from '@/lib/i18n';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { GundemPost } from '@/types/gundem';
import styles from './matchDiscussionCard.module.scss';

const PREVIEW_COUNT = 2;

type Props = {
  matchId: string;
  /** "Tartışmaya katıl": Forum sekmesine geçer (yazma kutusu orada; girişsiz kullanıcı oradaki giriş akışını görür). */
  onJoin: () => void;
};

function authorName(post: GundemPost, fallback: string): string {
  const a = post.author;
  if (a.deleted) return fallback;
  return a.username ? `@${a.username}` : a.name?.trim() || fallback;
}

/**
 * Genel Bakış'ın üstünde "💬 Maç tartışması" kartı: maç forumunun (Gündem `scope=match`) son 1–2 gönderisinin kısa
 * önizlemesi + Forum sekmesine götüren düğme. Veri SSR'a girmez: kart görünür alana yaklaşınca, tarayıcı boşta iken
 * istenir (Forum sekmesiyle AYNI sorgu anahtarı → sekmeye geçince liste anında hazır). Önizleme alanının yüksekliği
 * sabit: yükleniyor / boş / dolu durumları arasında kayma (CLS) yok.
 */
export default function MatchDiscussionCard({ matchId, onJoin }: Props) {
  const { t } = useTranslation('match');
  const [ref, inView] = useInViewOnce<HTMLElement>('200px', 2500);
  const feed = useGundemFeed('all', { matchId, enabled: inView, staleTime: 60_000 });
  const posts = (feed.data?.pages[0]?.items ?? []).slice(0, PREVIEW_COUNT);
  const loading = !inView || feed.isPending;
  const empty = !loading && posts.length === 0;

  return (
    <section ref={ref} className={styles.card} aria-labelledby={`match-discussion-${matchId}`}>
      <div className={styles.head}>
        <h3 id={`match-discussion-${matchId}`} className={styles.title}>
          <span aria-hidden>💬</span> {t('discussion.title')}
        </h3>
        <button type="button" className={styles.cta} onClick={onJoin}>
          {empty || feed.isError ? t('discussion.write') : t('discussion.join')}
        </button>
      </div>
      <div className={styles.preview} aria-busy={loading}>
        {loading ? (
          <>
            <span className={styles.skeleton} />
            <span className={`${styles.skeleton} ${styles.skeletonShort}`} />
          </>
        ) : empty || feed.isError ? (
          <button type="button" className={styles.empty} onClick={onJoin}>
            {t('discussion.empty')}
          </button>
        ) : (
          <ul className={styles.list}>
            {posts.map((p) => (
              <li key={p.id} className={styles.item}>
                <span className={styles.author}>{authorName(p, t('discussion.anonymous'))}</span>
                <span className={styles.body}>{p.body}</span>
                <time className={styles.time} dateTime={p.createdAt}>
                  {formatRelativeTime(p.createdAt, t)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
