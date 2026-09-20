import Image from 'next/image';
import styles from './avatar.module.scss';

export type AvatarProps = {
  name: string | null | undefined;
  image?: string | null;
  /** Piksel (harf boyutu ölçeklenir). Verilmezse boyutu CSS belirler (varsayılan 32px). */
  size?: number;
  className?: string;
};

/** "Ada Lovelace" → "A"; boş/null → "?". Tek kaynak: MatchForum, AccountMenu, AvatarPicker ve Gündem aynısını kullanır. */
export function avatarInitial(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0).toUpperCase() || '?';
}

/**
 * Yuvarlak kullanıcı görseli; görsel yoksa baş harf. Renkler `--avatar-bg` / `--avatar-fg` CSS değişkenleriyle
 * (className'i veren yerde) özelleştirilir — sıra/özgüllük sorunu olmadan.
 */
export default function Avatar({ name, image, size, className }: AvatarProps) {
  return (
    <span
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={size ? { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) } : undefined}
    >
      {image ? (
        <Image src={image} alt="" fill sizes={`${size ?? 40}px`} className={styles.img} unoptimized />
      ) : (
        <span aria-hidden="true">{avatarInitial(name)}</span>
      )}
    </span>
  );
}
