import { afterEach, describe, expect, it } from 'vitest';
import fixture from './__fixtures__/accessibleLeagues.json';
import {
  BIG_FIVE_IDS,
  SECOND_TIER_LEAGUE_IDS,
  compareLeaguePriority,
  leaguePriorityGroup,
} from './leaguePriority';
import { compareGroupedLeagues } from './leagues';

const ORIGINAL = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL;
});

type L = { id: number; name: string; country: string | null; category: number; sub_type: string };
const leagues = fixture.leagues as L[];
const byId = (id: number) => leagues.find((l) => l.id === id)!;
const sortInput = (l: L) => ({ competition_id: l.id, competition_name: l.name, country_name: l.country ?? undefined });

describe('leaguePriorityGroup — gerçek 34 liglik veri kümesiyle', () => {
  it('sinyal kanıtı: API `category` kademeyi AYIRMIYOR (Süper Lig ve 1. Lig ikisi de 2; 2. Bundesliga/Ligue 2/Championship de 2)', () => {
    expect(byId(600).category).toBe(2);
    expect(byId(603).category).toBe(2);
    expect([85, 304, 9, 387, 567].every((id) => byId(id).category === 2)).toBe(true);
  });

  it('1: Süper Lig; 2: büyük 5; 4: alt kademe; 3: geri kalan', () => {
    expect(leaguePriorityGroup(600)).toBe(1);
    for (const id of BIG_FIVE_IDS) expect(leaguePriorityGroup(id)).toBe(2);
    for (const id of [603, 1282, 1283, 9, 304, 85, 387, 567]) expect(leaguePriorityGroup(id)).toBe(4);
    for (const id of [636, 208, 648, 271, 72, 462, 573, 779, 609, 2, 5, 606, 570]) expect(leaguePriorityGroup(id)).toBe(3);
  });

  it('alt kademe tablosundaki her id gerçek veri kümesinde var ve yalnızca 2. kademe adlarına denk geliyor', () => {
    const names = [...SECOND_TIER_LEAGUE_IDS].map((id) => byId(id)?.name);
    expect(names.every(Boolean)).toBe(true);
    expect(names.sort()).toEqual(['1. Lig', '2. Bundesliga', '2. Lig: Beyaz', '2. Lig: Kirmizi', 'Championship', 'La Liga 2', 'Ligue 2', 'Serie B'].sort());
  });

  it('Süper Lig grup 1 değil "Türkiye 1. Lig ile aynı ülke" diye alt gruba düşmez; 1. Lig grup 4', () => {
    expect(leaguePriorityGroup(603)).toBeGreaterThan(leaguePriorityGroup(600));
  });

  it('bilinmeyen lig alt kademe gibi davranmaz: grup 3 (yanlışlıkla 4. gruba atılmaz, 1-2. gruba da çıkmaz)', () => {
    expect(leaguePriorityGroup(999999)).toBe(3);
    expect(leaguePriorityGroup(null)).toBe(3);
  });
});

describe('sıralama (Sportmonks açık)', () => {
  it('gerçek 34 lig karışık sırada verilse de: Süper Lig → PL, La Liga, Bundesliga, Serie A, Ligue 1 → diğer 1. ligler → alt kademe', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    const shuffled = [...leagues].reverse();
    const sorted = shuffled.sort((a, b) => compareGroupedLeagues(sortInput(a), sortInput(b)));
    const ids = sorted.map((l) => l.id);

    expect(ids.slice(0, 6)).toEqual([600, 8, 564, 82, 384, 301]);
    // Grup 3 (UEFA önce), sonra grup 4'ün tamamı en sonda
    const groups = ids.map((id) => leaguePriorityGroup(id));
    expect(groups).toEqual([...groups].sort((x, y) => x - y));
    expect(groups.slice(-8).every((g) => g === 4)).toBe(true);
    expect(ids.slice(6, 10)).toEqual([2, 5, 2286, 1328]);
  });

  it('grup içi: Türkiye alt kademesi (1. Lig, 2. Lig Beyaz/Kırmızı) diğer ülkelerin alt liglerinden önce, sonra ülke→ad', () => {
    const lower = [9, 304, 85, 387, 567, 1283, 1282, 603].map(byId).map((l) => ({ leagueId: l.id, competition_name: l.name, country_name: l.country ?? undefined }));
    const sorted = lower.sort(compareLeaguePriority).map((l) => l.leagueId);
    expect(sorted.slice(0, 3)).toEqual([603, 1282, 1283]);
    expect(sorted.slice(3)).toEqual([9, 304, 85, 387, 567]); // England, France, Germany, Italy, Spain
  });

  it('Sportmonks kapalıyken (legacy id) aynı öncelik: legacy 6 (Süper Lig) başta, legacy 344 (1. Lig) 5 büyükten sonra', () => {
    delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    const g = (id: number, name: string, country: string) => ({ competition_id: id, competition_name: name, country_name: country });
    const sorted = [g(344, '1. Lig', 'Turkey'), g(5, 'Ligue 1', 'France'), g(6, 'Super Lig', 'Turkey'), g(2, 'Premier League', 'England')].sort(compareGroupedLeagues);
    expect(sorted.map((x) => x.competition_id)).toEqual([6, 2, 5, 344]);
  });
});
