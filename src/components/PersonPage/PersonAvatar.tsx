import TeamLogo from '@/components/TeamLogo';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr');
}

/**
 * Hakem avatarı: Sportmonks fotoğrafı varsa (yer tutucu değilse, bkz. utils/personPhoto.ts) yuvarlak görsel; yoksa ya da
 * yüklenemezse baş harfler. `className` kapsayıcı yuvarlağın boyutunu / yazısını verir.
 */
export default function PersonAvatar({ name, photo, size, className, priority = false }: { name: string; photo?: string | null; size: number; className: string; priority?: boolean }) {
  const letters = (
    <span className={className} aria-hidden="true">
      {initials(name)}
    </span>
  );
  if (!photo) return letters;
  return <TeamLogo src={photo} width={size} height={size} className={className} priority={priority} fallback={letters} alt="" />;
}
