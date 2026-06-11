import styles from './skeleton.module.scss';

export type SkeletonVariant = 'default' | 'dark';

type SkeletonBlockProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  variant?: SkeletonVariant;
};

function blockClass(variant: SkeletonVariant, extra?: string) {
  return [variant === 'dark' ? styles.blockDark : styles.block, extra].filter(Boolean).join(' ');
}

function panelClass(variant: SkeletonVariant) {
  return variant === 'dark' ? styles.panelDark : styles.panel;
}

export function SkeletonBlock({
  className,
  width,
  height,
  variant = 'default',
}: SkeletonBlockProps) {
  return (
    <div
      className={blockClass(variant, className)}
      style={{ width, height }}
      aria-hidden
    />
  );
}

export function MatchCardSkeleton({ variant = 'default' }: { variant?: SkeletonVariant }) {
  return (
    <div className={variant === 'dark' ? styles.matchCardDark : styles.matchCard}>
      <div className={variant === 'dark' ? styles.matchCardHeaderDark : styles.matchCardHeader}>
        <SkeletonBlock variant={variant} width={120} height={14} />
        <SkeletonBlock variant={variant} width={100} height={14} />
      </div>
      <div className={styles.matchCardTeams}>
        <div className={styles.matchCardTeam}>
          <SkeletonBlock variant={variant} className={styles.logo} width={56} height={56} />
          <SkeletonBlock variant={variant} width={80} height={14} />
        </div>
        <SkeletonBlock variant={variant} width={72} height={32} />
        <div className={styles.matchCardTeam}>
          <SkeletonBlock variant={variant} className={styles.logo} width={56} height={56} />
          <SkeletonBlock variant={variant} width={80} height={14} />
        </div>
      </div>
    </div>
  );
}

export function PanelSkeleton({
  rows = 4,
  variant = 'default',
}: {
  rows?: number;
  variant?: SkeletonVariant;
}) {
  return (
    <div className={panelClass(variant)}>
      <SkeletonBlock variant={variant} width="45%" height={18} />
      <div className={styles.panelRows}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={styles.panelRow}>
            <SkeletonBlock variant={variant} width={28} height={14} />
            <SkeletonBlock variant={variant} className={styles.panelRowBar} height={8} />
            <SkeletonBlock variant={variant} width={28} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineupSkeleton({ variant = 'default' }: { variant?: SkeletonVariant }) {
  return (
    <div className={panelClass(variant)}>
      <SkeletonBlock variant={variant} width="30%" height={18} />
      <div className={styles.lineupGrid}>
        <div className={styles.lineupCol}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} variant={variant} height={14} />
          ))}
        </div>
        <SkeletonBlock variant={variant} className={styles.lineupPitch} height={180} />
        <div className={styles.lineupCol}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} variant={variant} height={14} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StandingsSkeleton({
  variant = 'default',
  rows = 8,
}: {
  variant?: SkeletonVariant;
  rows?: number;
}) {
  return (
    <div className={panelClass(variant)}>
      <SkeletonBlock variant={variant} width="50%" height={18} />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} variant={variant} height={12} className={styles.standingsRow} />
      ))}
    </div>
  );
}

export function WorldCupGroupCardSkeleton() {
  return (
    <div className={styles.wcGroupCard}>
      <SkeletonBlock variant="dark" width={120} height={22} />
      <div className={styles.wcGroupRows}>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} variant="dark" height={14} />
        ))}
      </div>
    </div>
  );
}

export function WorldCupGroupCardsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <WorldCupGroupCardSkeleton key={i} />
      ))}
    </>
  );
}

export function MatchListSkeleton({
  groups = 3,
  variant = 'default',
}: {
  groups?: number;
  variant?: SkeletonVariant;
}) {
  return (
    <>
      {Array.from({ length: groups }, (_, i) => (
        <PanelSkeleton key={i} rows={4} variant={variant} />
      ))}
    </>
  );
}

export function TeamHeaderSkeleton() {
  return (
    <div className={styles.teamHeaderSkeleton}>
      <SkeletonBlock className={styles.teamHeaderLogo} width={56} height={56} />
      <div className={styles.teamHeaderText}>
        <SkeletonBlock width="45%" height={22} />
        <SkeletonBlock width="30%" height={14} />
      </div>
      <SkeletonBlock width={100} height={36} />
    </div>
  );
}
