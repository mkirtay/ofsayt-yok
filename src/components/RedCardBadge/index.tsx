import type { Match } from '@/models/liveScore';
import { useTranslation } from '@/lib/i18n';
import { deriveMatchPhase } from '@/utils/matchPhase';
import styles from './redCardBadge.module.scss';

/** Bu sayıdan sonrası tek kart + "×n" (iki karta kadar ayrı ayrı çizilir). */
export const RED_CARD_ICON_MAX = 2;

/** Takımın gösterilecek kırmızı kart sayısı: yalnız canlı / devre arası / bitmiş maçta, yoksa 0. */
export function redCardCountFor(match: Pick<Match, 'status' | 'red_cards'>, side: 'home' | 'away'): number {
  if (deriveMatchPhase(match.status) === 'PRE') return 0;
  const n = match.red_cards?.[side] ?? 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Takım adının yanındaki küçük kırmızı kart (EventTimeline'daki kart stili). Yerleşim kaymasın diye çağıran taraf adın
 * DIŞ tarafına koyar (ev sahibinde adın solu, deplasmanda sağı); ad skora bitişik yerinde kalır. Kart yoksa hiçbir şey
 * çizilmez. `size`: satır / ticker `sm`, maç başlığı `md`.
 */
export default function RedCardBadge({
  count,
  size = 'sm',
  className,
}: {
  count: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useTranslation('match');
  if (!(count > 0)) return null;
  const label = count === 1 ? t('redCards.one') : t('redCards.many', { count });
  const icons = count <= RED_CARD_ICON_MAX ? count : 1;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={[styles.badge, size === 'md' ? styles.md : styles.sm, className].filter(Boolean).join(' ')}
    >
      {Array.from({ length: icons }, (_, i) => (
        <i key={i} className={styles.card} aria-hidden="true" />
      ))}
      {count > RED_CARD_ICON_MAX ? (
        <span className={styles.times} aria-hidden="true">
          ×{count}
        </span>
      ) : null}
    </span>
  );
}
