/**
 * Topa basılacak lig logoları: `pinned` her zaman (ör. Süper Lig), kalanlar havuzdan karışık (rand enjekte → testlenir).
 * Tekrar yok; havuz yetmezse olduğu kadar.
 */
export function pickLogoIds(pool: readonly number[], count: number, pinned: readonly number[], rand: () => number = Math.random): number[] {
  const out = pinned.filter((id) => pool.includes(id)).slice(0, count);
  const rest = pool.filter((id) => !out.includes(id));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...out, ...rest].slice(0, Math.max(0, count));
}
