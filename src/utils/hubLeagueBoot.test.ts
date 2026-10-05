import { describe, expect, it } from 'vitest';
import { HUB_LEAGUE_PENDING_ATTR, hubLeagueBootScript, storedHubLeagueIdFromRaw } from './hubLeagueBoot';

/** Betiği sahte `location` / `localStorage` / `document` ile çalıştırır; öznitelik yazıldı mı. */
function runBoot(raw: string | null, pathname = '/', defaultId = 600): boolean {
  const attrs = new Map<string, string>();
  const fn = new Function('location', 'localStorage', 'document', hubLeagueBootScript(defaultId));
  fn({ pathname }, { getItem: () => raw }, { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } });
  return attrs.has(HUB_LEAGUE_PENDING_ATTR);
}

describe('hatırlanan lig ön-boyaması', () => {
  it('varsayılandan farklı kayıt → öznitelik (lig adı / panel gizlenir)', () => {
    expect(runBoot(JSON.stringify({ id: 8, rows: 20 }))).toBe(true);
    expect(runBoot('8')).toBe(true);
  });

  it('kayıt yok / varsayılan / bozuk / ana sayfa dışı → öznitelik yok (varsayılan hemen görünür)', () => {
    expect(runBoot(null)).toBe(false);
    expect(runBoot(JSON.stringify({ id: 600, rows: 18 }))).toBe(false);
    expect(runBoot('{bozuk')).toBe(false);
    expect(runBoot(JSON.stringify({ id: 1.5 }))).toBe(false);
    expect(runBoot(JSON.stringify({ id: 0 }))).toBe(false);
    expect(runBoot(JSON.stringify({ id: 8 }), '/matches/1')).toBe(false);
  });

  it('betik ve TS ayrıştırıcı aynı kural', () => {
    for (const raw of [null, '8', '{"id":8,"rows":20}', '{"id":600}', '{bozuk', '{"id":0}', '"x"']) {
      const id = storedHubLeagueIdFromRaw(raw);
      expect(runBoot(raw)).toBe(id != null && id !== 600);
    }
  });
});
