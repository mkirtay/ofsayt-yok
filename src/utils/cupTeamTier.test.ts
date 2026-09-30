import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cupTeamTierKey, isTurkishCupMatch } from './cupTeamTier';

const cup = (date = '2026-10-06') => ({ competition: { id: 606, name: 'Turkish Cup' }, date }) as never;
const payload = {
  tiers: { '10': 600, '11': 603, '12': 1282, '13': 1283 },
  validFrom: '2026-07-01',
};

describe('cupTeamTierKey (Sportmonks açık)', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('kısa kademe: Süper Lig / 1. Lig / 2. Lig — Beyaz ve Kırmızı ikisi de "2. Lig" (grup yalnız detay başlığında)', () => {
    expect(cupTeamTierKey(cup(), 10, payload)).toBe('superLig');
    expect(cupTeamTierKey(cup(), 11, payload)).toBe('firstLeague');
    expect(cupTeamTierKey(cup(), 12, payload)).toBe('secondLeague');
    expect(cupTeamTierKey(cup(), '13', payload)).toBe('secondLeague');
  });

  it('planda olmayan takım (3. Lig/BAL/amatör) → etiket yok, "Amatör" uydurulmaz', () => {
    expect(cupTeamTierKey(cup(), 99999, payload)).toBeNull();
  });

  it('kupa olmayan maçta / harita yokken / takım id yokken etiket yok', () => {
    expect(cupTeamTierKey({ competition: { id: 600 }, date: '2026-10-06' } as never, 10, payload)).toBeNull();
    expect(cupTeamTierKey(cup(), 10, null)).toBeNull();
    expect(cupTeamTierKey(cup(), undefined, payload)).toBeNull();
  });

  it('geçen sezonun kupa maçına güncel harita uygulanmaz', () => {
    expect(cupTeamTierKey(cup('2026-05-20'), 10, payload)).toBeNull();
    expect(cupTeamTierKey(cup('2026-08-12'), 10, payload)).toBe('superLig');
  });

  it('isTurkishCupMatch: yalnız 606', () => {
    expect(isTurkishCupMatch(cup())).toBe(true);
    expect(isTurkishCupMatch({ competition_id: 606 } as never)).toBe(true);
    expect(isTurkishCupMatch({ competition: { id: 570 } } as never)).toBe(false);
    expect(isTurkishCupMatch(null)).toBe(false);
  });
});

describe('cupTeamTierKey (Sportmonks kapalı)', () => {
  it('eski sağlayıcıda id uzayı farklı → rozet yok', () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'false');
    expect(cupTeamTierKey(cup(), 10, payload)).toBeNull();
    vi.unstubAllEnvs();
  });
});
