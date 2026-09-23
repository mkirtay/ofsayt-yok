/** `contains` taşıyan her şey (DOM Node veya testte sahte düğüm). */
type ContainerLike = { contains(other: unknown): boolean };

/**
 * Dışarı-tıklama kararı: hedef verilen kapsayıcıların HİÇBİRİNİN içinde değilse true.
 * Tetikleyici de kapsayıcılara eklenir — aksi hâlde açıkken tetikleyiciye basmak önce "dışarı" sayılıp kapatır,
 * ardından tetikleyicinin kendi toggle'ı paneli yeniden açardı.
 */
export function isOutside(target: unknown, containers: (ContainerLike | null | undefined)[]): boolean {
  if (target == null) return false;
  return !containers.some((c) => c != null && c.contains(target));
}
