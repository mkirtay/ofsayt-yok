import { useEffect, useState } from 'react';

/**
 * Lig logosu — `src` yoksa ya da görsel yüklenemezse kırık-görsel ikonu yerine
 * nötr bir daire placeholder çizer.
 */
export default function LeagueLogo({
  src,
  size = 20,
  className,
}: {
  src: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-muted)', display: 'inline-block' }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={className}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
