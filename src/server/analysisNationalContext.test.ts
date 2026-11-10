import { describe, expect, it, vi } from 'vitest';
import type { AfFixture } from '@/services/apiFootball/types';
import { buildAnalysisUserMessage } from '@/config/analysisPrompt';
import {
  buildNationalAnalysisContext,
  buildNationalNotes,
  computeStandingsAsOf,
  computeTeamSeasonStatsAsOf,
  splitTeamFixtures,
  type AfGet,
} from './analysisNationalContext';
import turIta from '@/services/apiFootball/__fixtures__/fixtureNationsLeagueTurIta_1528905.json';
import team26 from '@/services/apiFootball/__fixtures__/fixturesTeamTurkey2026.json';
import team25 from '@/services/apiFootball/__fixtures__/fixturesTeamTurkey2025.json';
import h2hTurIta from '@/services/apiFootball/__fixtures__/headToHeadTurIta.json';
import leagueGroup from '@/services/apiFootball/__fixtures__/fixturesLeagueNationsLeagueGroupTur2026.json';

/** Gerçek AF yanıtları (2026-11-10). Maç: Türkiye 1-4 İtalya, UNL League A - 2, 28.09.2026 (sonuç biliniyor → sızıntı testi). */
const MATCH = (turIta as unknown as { response: AfFixture[] }).response[0]!;
const KO = Date.parse(MATCH.fixture.date);
const LEAGUE = (leagueGroup as unknown as { response: AfFixture[] }).response;
const TUR_AF = 777;
const ITA_AF = 768;

const env = (x: unknown) => ({ response: (x as { response: unknown[] }).response });
const fakeGet: AfGet & { calls: Array<[string, Record<string, unknown>]> } = Object.assign(
  (async (path: string, params: Record<string, string | number>) => {
    fakeGet.calls.push([path, params]);
    if (path === '/fixtures/headtohead') return env(h2hTurIta);
    if (path === '/fixtures' && params.league) return env(leagueGroup);
    if (path === '/fixtures' && params.team === TUR_AF) return env(params.season === 2026 ? team26 : params.season === 2025 ? team25 : { response: [] });
    if (path === '/fixtures') return { response: [] };
    throw new Error(`beklenmeyen ${path}`);
  }) as unknown as AfGet,
  { calls: [] as Array<[string, Record<string, unknown>]> },
);

describe('milli maç analiz bağlamı (geriye dönük = sızıntısız)', () => {
  it('maç sonucu, olaylar, kadro ve hakem bağlama sızmaz; maç öncesi kurulur', async () => {
    const ctx = await buildNationalAnalysisContext('2001528905', { get: fakeGet, historical: true, fixture: MATCH });
    expect(ctx && !ctx.archived).toBe(true);
    if (!ctx || ctx.archived) return;
    expect(ctx.matchPhase).toBe('PRE');
    expect(ctx.match.status).toBe('NOT STARTED');
    expect(ctx.match.scores).toBeUndefined();
    expect(ctx.match.referee).toBeUndefined();
    expect(ctx.events).toEqual([]);
    expect(ctx.lineups).toBeNull();
    expect(ctx.liveStats).toBeNull();
    expect(ctx.referee).toBeNull();
    expect(ctx.homeTeam.absences).toBeUndefined();
    const prompt = buildAnalysisUserMessage(ctx);
    expect(prompt).not.toMatch(/Mevcut skor/);
    expect(prompt).not.toMatch(/Eksikler/);
    expect(prompt).not.toMatch(/Muhtemel 11|İlk 11/);
    expect(prompt).toContain('Maç Türü Notu');
    expect(prompt).toContain('milli takım maçıdır');
  });

  it('son maçlar yalnız maçtan ÖNCEKİ bitmiş maçlar; kendisi ve sonrası yok', async () => {
    const ctx = (await buildNationalAnalysisContext('2001528905', { get: fakeGet, historical: true, fixture: MATCH }))!;
    if (ctx.archived) throw new Error('archived');
    const rows = ctx.homeTeam.recentMatches;
    expect(rows[0]).toMatchObject({ opponent: 'Fransa', goalsFor: 0, goalsAgainst: 1, result: 'L', isHome: true });
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort().reverse());
    expect(rows.every((r) => r.date < '2026-09-28')).toBe(true);
    expect(rows.some((r) => r.opponent === 'İtalya')).toBe(false);
    expect(ctx.homeTeam.metrics.matchesAnalyzed).toBe(rows.length);
    // 2025 hazırlıkları da pencerede (10'dan az olduğu için bir önceki yıl çekilir)
    expect(fakeGet.calls.some(([, p]) => p.team === TUR_AF && p.season === 2024)).toBe(true);
  });

  it('H2H maçtan önceki 3 karşılaşma (kendisi ve sonraki 05.10 maçı hariç)', async () => {
    const ctx = (await buildNationalAnalysisContext('2001528905', { get: fakeGet, historical: true, fixture: MATCH }))!;
    if (ctx.archived) throw new Error('archived');
    expect(ctx.h2h?.totalMatches).toBe(3);
    expect(ctx.h2h?.last3[0]?.date).toBe('2024-06-04');
    expect(ctx.h2h?.last3.some((r) => (r.date ?? '') >= '2026-09-28')).toBe(false);
  });

  it('puan durumu maç tarihine göre: Türkiye 1 maçta 0 puan (sonraki 3 maç sayılmaz); durum bölümü: sıradaki maç 4 gün sonra', async () => {
    const ctx = (await buildNationalAnalysisContext('2001528905', { get: fakeGet, historical: true, fixture: MATCH }))!;
    if (ctx.archived) throw new Error('archived');
    expect(ctx.homeTeam.standingRow).toMatchObject({ matches: 1, points: 0 });
    expect(ctx.homeTeam.leagueStats?.total).toMatchObject({ played: 1, lost: 1, goalsFor: 0, goalsAgainst: 1 });
    expect(ctx.situation?.home.nextMatch).toMatchObject({ daysAfter: 4, opponent: 'Belçika' });
    expect(ctx.situation?.home.lastMatch?.daysBefore).toBe(3);
    expect(ctx.situation?.home.league).toBeNull();
    expect(ctx.situation?.isDerby).toBeNull();
  });

  it('id milli değilse null; maç bulunamazsa null', async () => {
    expect(await buildNationalAnalysisContext('12345', { get: fakeGet })).toBeNull();
    const none: AfGet = async () => ({ response: [] });
    expect(await buildNationalAnalysisContext('2001528905', { get: none })).toBeNull();
  });

  it('H2H hatası bağlamı düşürmez; kullanılan istekler analiz havuzu uçlarıdır', async () => {
    const get = vi.fn(async (path: string, params: Record<string, string | number>) => {
      if (path === '/fixtures/headtohead') throw new Error('h2h down');
      return fakeGet(path, params);
    }) as unknown as AfGet;
    const ctx = await buildNationalAnalysisContext('2001528905', { get, historical: true, fixture: MATCH });
    expect(ctx && !ctx.archived && ctx.h2h).toBeNull();
  });
});

describe('saf hesaplar', () => {
  it('computeStandingsAsOf: tek grup tablosu, sıralama puan/averaj', () => {
    const t = computeStandingsAsOf(LEAGUE, Date.parse('2026-11-01T00:00:00Z'), { id: 5, name: 'UEFA Uluslar Ligi', season: 2026 });
    const rows = t?.table ?? [];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows.every((r) => r.matches === 4)).toBe(true); // 12 fikstürün 4'er maçı bitmiş (5. ve 6. hafta henüz yok)
    expect(rows.reduce((s, r) => s + r.goals_scored!, 0)).toBe(rows.reduce((s, r) => s + r.goals_conceded!, 0));
  });

  it('computeTeamSeasonStatsAsOf: oynanmamışsa null; ev/dep ayrımı', () => {
    expect(computeTeamSeasonStatsAsOf(LEAGUE, TUR_AF, Date.parse('2026-01-01T00:00:00Z'), { id: 5, season: 2026 })).toBeNull();
    const s = computeTeamSeasonStatsAsOf(LEAGUE, TUR_AF, Date.parse('2026-11-01T00:00:00Z'), { id: 5, season: 2026 })!;
    expect(s.total.played).toBe(4);
    expect(s.home.played + s.away.played).toBe(4);
    expect(s.total.won + s.total.drawn + s.total.lost).toBe(4);
  });

  it('splitTeamFixtures: genç/kadın rakipler elenir, maçın kendisi dışarıda', () => {
    const base = (id: number, home: string, date: string, goals: [number, number] | null): AfFixture =>
      ({
        fixture: { id, date, status: { short: goals ? 'FT' : 'NS' } },
        league: { id: 10, name: 'Friendlies' },
        teams: { home: { id: TUR_AF, name: home }, away: { id: 9, name: 'Spain' } },
        goals: { home: goals?.[0] ?? null, away: goals?.[1] ?? null },
        score: {},
      }) as unknown as AfFixture;
    const out = splitTeamFixtures(
      [base(1, 'Turkey', '2026-01-01T12:00:00+00:00', [1, 0]), base(2, 'Turkey W', '2026-01-02T12:00:00+00:00', [1, 0]), base(3, 'Turkey', '2026-03-01T12:00:00+00:00', null), base(99, 'Turkey', '2026-02-01T12:00:00+00:00', [2, 2])],
      TUR_AF,
      Date.parse('2026-02-01T12:00:00+00:00'),
      99,
    );
    expect(out.played.map((f) => f.fixture.id)).toEqual([1]);
    expect(out.upcoming.map((f) => f.fixture.id)).toEqual([3]);
  });

  it('notlar: hazırlıkta rotasyon uyarısı, eksik veri için uydurma yasağı; grup maçında tablo notu', () => {
    const m = { stage: 'League A - 2' } as never;
    expect(buildNationalNotes(m, 10, false).join(' ')).toMatch(/Hazırlık maçı/);
    expect(buildNationalNotes(m, 5, true).join(' ')).toMatch(/gruptaki oynanmış/);
    expect(buildNationalNotes(m, 5, true).join(' ')).toMatch(/uydurma/);
    expect(buildNationalNotes({ stage: 'Round of 16' } as never, 1, false).join(' ')).toMatch(/Eleme turu/);
  });
});

describe('ITA fikstür kimliği', () => {
  it('fixture yanıtı beklenen takımlar', () => {
    expect(MATCH.teams.home.id).toBe(TUR_AF);
    expect(MATCH.teams.away.id).toBe(ITA_AF);
    expect(KO).toBeGreaterThan(0);
  });
});
