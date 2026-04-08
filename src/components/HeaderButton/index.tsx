import styles from './headerButton.module.scss';

interface HeaderButtonProps {
  children: React.ReactNode;
  variant: 'outline' | 'filled';
  onClick?: () => void;
}

export default function HeaderButton({ children, variant, onClick }: HeaderButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${variant === 'filled' ? styles.filled : styles.outline}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
