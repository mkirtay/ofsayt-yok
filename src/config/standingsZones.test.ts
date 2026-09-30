import { afterEach, describe, expect, it } from 'vitest';
import { getStandingRankZone, zoneRuleCompetitionId } from './standingsZones';

const original = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = original;
});

describe('standingsZones — Sportmonks league_id ile', () => {
  it('Süper Lig (600) kuralları uygulanır: 1 ŞL, 2 ŞL eleme, 3 Avrupa, 4 Konferans, son 3 küme düşme', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(getStandingRankZone(1, 18, 600)).toBe('ucl');
    expect(getStandingRankZone(2, 18, 600)).toBe('ucl_qual');
    expect(getStandingRankZone(3, 18, 600)).toBe('europa');
    expect(getStandingRankZone(4, 18, 600)).toBe('conference_qual');
    expect(getStandingRankZone(16, 18, 600)).toBe('relegation');
    expect(getStandingRankZone(10, 18, 600)).toBeNull();
  });

  it('Premier League (8) kuralları uygulanır', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(getStandingRankZone(4, 20, 8)).toBe('ucl');
    expect(getStandingRankZone(5, 20, 8)).toBe('europa');
  });

  it('Sportmonks 2 = Şampiyonlar Ligi: Premier Lig kurallarıyla BOYANMAZ', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(getStandingRankZone(5, 36, 2)).toBe('promotion'); // ŞL lig aşaması 1-8 (PL kuralı 5. için 'europa' verirdi)
    expect(getStandingRankZone(10, 36, 2)).toBe('uefa_league_playoff');
  });

  it('eşlemesiz lig (2. Lig Kırmızı 1283) varsayılan kurallar', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(zoneRuleCompetitionId(1283)).toBeUndefined();
    expect(getStandingRankZone(1, 17, 1283)).toBe('promotion');
  });
});
