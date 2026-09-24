import { formatRating, ratingTone } from '@/config/ratingScale';
import styles from './ratingBadge.module.scss';

export type RatingBadgeProps = {
  rating: number | null | undefined;
  /** `xs`: saha dizilimi köşe rozeti · `sm`: liste satırı · `md`: özet kutusu */
  size?: 'xs' | 'sm' | 'md';
  /** Reyting yokken nötr gri "—" rozeti çiz (varsayılan: hiç çizme). */
  showEmpty?: boolean;
  /** Ekran okuyucu etiketi; verilmezse yalnızca sayı okunur. */
  ariaLabel?: string;
  /** Gösterilecek metin (ör. sezon ortalaması iki ondalık); verilmezse `formatRating`. */
  text?: string;
  className?: string;
  'data-testid'?: string;
};

/**
 * Reyting rozeti — renk `ratingTone` bandından (`src/config/ratingScale.ts`), zemin/metin `--rating-*` tokenlarından.
 * Renk tek bilgi taşıyıcısı değil: sayı her zaman rozetin içinde.
 */
export default function RatingBadge({ rating, size = 'sm', showEmpty = false, ariaLabel, text, className, ...rest }: RatingBadgeProps) {
  const value = text ?? formatRating(rating);
  if (value == null && !showEmpty) return null;
  const tone = value == null ? 'none' : ratingTone(rating);
  return (
    <span
      className={[styles.badge, styles[size], styles[tone], className].filter(Boolean).join(' ')}
      data-tone={tone}
      data-testid={rest['data-testid']}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {value ?? '—'}
    </span>
  );
}
