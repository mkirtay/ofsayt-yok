import { describe, expect, it } from 'vitest';
import { TEAM_FORM_INCLUDE, teamFormFreshSeconds } from './teamForm';
import { sportmonksCacheTtl } from './cachePolicy';
import { TEAM_OVERVIEW_INCLUDE } from './teamOverview';
import { checkProxyAllowlist } from '@/server/sportmonks/proxyAllowlist';

const NOW = Date.parse('2026-10-14T18:00:00Z');
const at = (hoursFromNow: number) => ({ starting_at_timestamp: Math.floor(NOW / 1000 + hoursFromNow * 3600) });

describe('takım formu önbellek süresi (teams/{id}?include=latest…)', () => {
  it('eski `between` formu kuralı: son maç başlayalı < 5 sa → 1 sa, değilse 6 sa', () => {
    expect(teamFormFreshSeconds({ latest: [at(-3), at(-80)], upcoming: [] }, NOW)).toBe(3600);
    expect(teamFormFreshSeconds({ latest: [at(-30)], upcoming: [] }, NOW)).toBe(6 * 3600);
    expect(teamFormFreshSeconds({ latest: [], upcoming: [] }, NOW)).toBe(6 * 3600);
  });

  it('sıradaki maç: en geç beklenen bitişine (başlama + 105 dk) kadar taze', () => {
    expect(teamFormFreshSeconds({ latest: [at(-72)], upcoming: [at(2), at(100)] }, NOW)).toBe(2 * 3600 + 105 * 60);
    // Uzak maç temel süreyi kısaltmaz.
    expect(teamFormFreshSeconds({ latest: [at(-72)], upcoming: [at(48)] }, NOW)).toBe(6 * 3600);
  });

  it('başlamış ama latest’e geçmemiş maç (canlı / bitişi işlenmemiş) → 10 dk; 4 sa’ten eski askıdaki maç yok sayılır', () => {
    expect(teamFormFreshSeconds({ latest: [at(-72)], upcoming: [at(-1)] }, NOW)).toBe(600);
    expect(teamFormFreshSeconds({ latest: [at(-72)], upcoming: [at(-30), at(48)] }, NOW)).toBe(6 * 3600);
  });

  it('cachePolicy yalnız form isteğine uygular; takım sayfası isteği eski kuralda (≤ 15 dk)', () => {
    const team = { id: 34, latest: [{ ...at(-30), state_id: 5 }], upcoming: [{ ...at(48), state_id: 1 }] };
    expect(sportmonksCacheTtl('football/teams/34', team, NOW, { include: TEAM_FORM_INCLUDE }).fresh).toBe(6 * 3600);
    expect(sportmonksCacheTtl('football/teams/34', team, NOW, { include: TEAM_OVERVIEW_INCLUDE }).fresh).toBe(15 * 60);
  });

  it('tarayıcı proxy izin listesi form isteğini kabul eder (maç kartı istemci yolu)', () => {
    const r = checkProxyAllowlist('football/teams/34', { include: TEAM_FORM_INCLUDE });
    expect(r.violations).toEqual([]);
  });
});
