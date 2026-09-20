import HeartIcon from '@/components/icons/HeartIcon';
import styles from './likeButton.module.scss';

export type LikeButtonProps = {
  liked: boolean;
  count: number;
  disabled?: boolean;
  onToggle: () => void;
  /** Erişilebilir ad (aria-label) */
  label: string;
  title?: string;
  className?: string;
};

/** Beğeni düğmesi (kalp + sayaç, `aria-pressed`). MatchForum yorum beğenisi ve Gündem post beğenisi ortak kullanır. */
export default function LikeButton({ liked, count, disabled, onToggle, label, title, className }: LikeButtonProps) {
  return (
    <button
      type="button"
      className={[styles.btn, liked ? styles.active : '', className].filter(Boolean).join(' ')}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={liked}
      aria-label={label}
      title={title ?? label}
    >
      <HeartIcon filled={liked} />
      <span className={styles.count}>{count}</span>
    </button>
  );
}
