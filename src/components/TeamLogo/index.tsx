import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { logoSrc } from '@/utils/logoUrl';

export type TeamLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'loading'> & {
  src: string | null | undefined;
  /** Görüntü boyutu (CSS px) — `<img width/height>` olarak da yazılır (yer baştan ayrılır, kayma yok). */
  width: number;
  height?: number;
  /** İlk ekrandaki görsel: `loading="eager"`. Varsayılan tembel. */
  priority?: boolean;
  /** Logo yoksa ya da hem küçük sürüm hem orijinal yüklenemezse gösterilecek (yoksa hiçbir şey). */
  fallback?: ReactNode;
  /** Hem küçük sürüm hem orijinal yüklenemedi (çağıran kendi yedeğine geçmek isterse). */
  onFail?: () => void;
};

/**
 * Takım/lig logosu, bayrak, oyuncu fotoğrafı — Sportmonks görselleri buradan geçer (tek URL üreticisi:
 * utils/logoUrl.ts). Küçük webp sürümü yüklenemezse orijinal URL denenir; o da olmazsa `fallback`.
 */
export default function TeamLogo({ src, width, height = width, priority = false, fallback = null, onFail, alt = '', ...rest }: TeamLogoProps) {
  // Hata yalnızca ilgili `src` için geçerli: kaynak değişince baştan denenir (effect'te setState gerekmez).
  const [failure, setFailure] = useState<{ src: string; stage: 1 | 2 } | null>(null);
  const stage = failure && failure.src === src ? failure.stage : 0;

  if (!src || stage === 2) return <>{fallback}</>;
  const small = logoSrc(src, Math.max(width, height)) ?? src;
  const current = stage === 0 ? small : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={current}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={(e) => {
        rest.onError?.(e);
        const next = stage === 0 && small !== src ? 1 : 2;
        setFailure({ src, stage: next });
        if (next === 2) onFail?.();
      }}
    />
  );
}
