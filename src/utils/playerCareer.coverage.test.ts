import { describe, expect, it } from 'vitest';
import osimhenFixture from '@/services/sportmonks/__fixtures__/playerCareerOsimhen.json';
import lamineFixture from '@/services/sportmonks/__fixtures__/playerCareerLamineYamal.json';
import ugurcanFixture from '@/services/sportmonks/__fixtures__/playerCareerUgurcan.json';
import { mapPlayerProfile, type PlayerSeasonStats, type RawPlayer } from '@/services/playerProfile';
import { buildPlayerCareer, isCareerPartial } from './playerCareer';

const seasonsOf = (f: unknown) => mapPlayerProfile((f as { data: RawPlayer }).data).seasons;
const coverage = (seasons: PlayerSeasonStats[]) => {
  const c = buildPlayerCareer(seasons);
  return { partial: isCareerPartial(c), teams: Object.fromEntries(c.teams.map((t) => [t.teamName, t.partialSeasons])) };
};

describe('Kariyer kapsamı ("Kısmi veri") — gerçek yanıtlar', () => {
  it('Osimhen: Napoli ve Lille kısmi (yalnız UEFA satırı, lig sezonu plan dışı); Galatasaray eksiksiz; genel toplam kısmi', () => {
    const c = coverage(seasonsOf(osimhenFixture));
    expect(c.teams).toEqual({
      Galatasaray: [],
      Napoli: ['2023/2024', '2022/2023', '2021/2022', '2020/2021'],
      'LOSC Lille': ['2019/2020'],
    });
    expect(c.partial).toBe(true);
  });

  it('Lamine Yamal 2024/25 ve sonrası: Barcelona eksiksiz, genel toplam eksiksiz (rozet yok)', () => {
    const recent = seasonsOf(lamineFixture).filter((s) => s.seasonName >= '2024/2025');
    expect(recent).toHaveLength(8);
    const c = coverage(recent);
    expect(c.teams).toEqual({ 'FC Barcelona': [] });
    expect(c.partial).toBe(false);
  });

  it('Lamine Yamal tam veri: 2023/24 Şampiyonlar Ligi satırı var, La Liga 2023/24 yok → Barcelona kısmi', () => {
    const c = coverage(seasonsOf(lamineFixture));
    expect(c.teams).toEqual({ 'FC Barcelona': ['2023/2024'] });
    expect(c.partial).toBe(true);
  });

  it('Uğurcan: Galatasaray eksiksiz, Trabzonspor kısmi (2024/25 öncesi yalnız UEFA)', () => {
    const c = coverage(seasonsOf(ugurcanFixture));
    expect(c.teams).toEqual({ Galatasaray: [], Trabzonspor: ['2022/2023', '2021/2022', '2019/2020', '2015/2016'] });
    expect(c.partial).toBe(true);
  });
});

describe('Kariyer kapsamı — kenar durumlar', () => {
  const row = (seasonName: string, teamId: number, isCup: boolean): PlayerSeasonStats => ({
    key: `${seasonName}-${teamId}-${isCup}`,
    isCup,
    seasonId: 1,
    seasonName,
    teamId,
    teamName: `T${teamId}`,
    leagueName: isCup ? 'Cup' : 'League',
    stats: { 321: { total: 1 } },
  });

  it('kapsanan sezonda yalnız kupada oynamak (yedek kaleci) kısmi SAYILMAZ', () => {
    const c = coverage([row('2025/2026', 2, true), row('2025/2026', 1, false), row('2024/2025', 1, false)]);
    expect(c.teams).toEqual({ T1: [], T2: [] });
    expect(c.partial).toBe(false);
  });

  it('hiç lig satırı yoksa her kupa-yalnız sezon kapsam dışı', () => {
    const c = coverage([row('2025/2026', 1, true), row('2019/2020', 1, true)]);
    expect(c.teams).toEqual({ T1: ['2025/2026', '2019/2020'] });
    expect(c.partial).toBe(true);
  });

  it('aynı sezonda lig satırı olan takım kısmi değil; başka takımın kupa-yalnız eski sezonu yalnız onu kısmi yapar', () => {
    const c = coverage([row('2024/2025', 1, false), row('2024/2025', 1, true), row('2022/2023', 2, true)]);
    expect(c.teams).toEqual({ T1: [], T2: ['2022/2023'] });
    expect(c.partial).toBe(true);
  });
});
