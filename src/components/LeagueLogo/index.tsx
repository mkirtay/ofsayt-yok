import TeamLogo from '@/components/TeamLogo';

/**
 * Lig logosu — `src` yoksa ya da görsel yüklenemezse kırık-görsel ikonu yerine nötr bir daire placeholder çizer.
 * URL ve yedek davranışı `TeamLogo`'dan (Sportmonks logosu küçük webp olarak gelir).
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
  const placeholder = (
    <span
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-muted)', display: 'inline-block' }}
    />
  );
  return <TeamLogo src={src} width={size} className={className} fallback={placeholder} />;
}
