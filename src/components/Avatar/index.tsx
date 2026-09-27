import { useState } from 'react';
import Image from 'next/image';
import styles from './avatar.module.scss';

export type AvatarProps = {
  name: string | null | undefined;
  image?: string | null;
  /** Piksel (harf boyutu ölçeklenir). Verilmezse boyutu CSS belirler (varsayılan 32px). */
  size?: number;
  className?: string;
};

/**
 * Ad-soyad baş harfleri: "Ada Lovelace" → "AL", "Mucahid Ali Kirtay" → "MK", "ada" → "A"; boş/null → "?".
 * Tek kaynak: MatchForum, AccountMenu, AvatarPicker ve Gündem aynısını kullanır.
 */
export function avatarInitial(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('tr');
}

/**
 * Yuvarlak kullanıcı görseli; görsel yoksa ya da yüklenemezse baş harfler. Renkler `--avatar-bg` / `--avatar-fg` CSS
 * değişkenleriyle (className'i veren yerde) özelleştirilir — sıra/özgüllük sorunu olmadan.
 * `referrerPolicy="no-referrer"`: Google profil fotoğrafları (lh3.googleusercontent.com) Referer'lı isteği reddediyor.
 */
export default function Avatar({ name, image, size, className }: AvatarProps) {
  // Hangi URL'nin yüklenemediğini tutar → görsel değişince (ör. profil güncellemesi) yeniden denenir
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!image && failedSrc !== image;

  return (
    <span
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={size ? { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) } : undefined}
    >
      {showImage ? (
        <Image
          src={image}
          alt=""
          fill
          sizes={`${size ?? 40}px`}
          className={styles.img}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(image)}
        />
      ) : (
        <span aria-hidden="true">{avatarInitial(name)}</span>
      )}
    </span>
  );
}
