import { useI18n, useTranslation } from '@/lib/i18n';
import { formatCount, type MatchCounts } from '@/config/matchCounters';
import styles from './matchCountersBadge.module.scss';

type Props = {
  counts: MatchCounts | null | undefined;
  /** `row`: maç listesi satırında küçük köşe etiketi; `header`: maç başlığı altında satır. */
  variant?: 'row' | 'header';
  className?: string;
};

/**
 * "👁 753 · 💬 18" — maçın görüntülenme + yorum sayısı. Yalnız sayı verisi olan (= görmeye yetkili) kullanıcıda çizilir;
 * çağıran veri yoksa `counts` vermez → hiçbir şey çizilmez.
 */
export default function MatchCountersBadge({ counts, variant = 'row', className }: Props) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  if (!counts) return null;
  const views = formatCount(counts.views, locale);
  const comments = formatCount(counts.comments, locale);
  const label = t('counters.label', { views: counts.views, comments: counts.comments });
  return (
    <span
      className={[styles.badge, variant === 'header' ? styles.header : styles.row, className].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
      data-testid="match-counters"
    >
      <span aria-hidden>👁 {views}</span>
      <span aria-hidden className={styles.sep}>·</span>
      <span aria-hidden>💬 {comments}</span>
    </span>
  );
}
