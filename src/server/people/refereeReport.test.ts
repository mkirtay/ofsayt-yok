import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeRedis, type FakeRedis } from '../sportmonks/fakeRedis.testutil';
import type { RefereePageData } from './refereePage';
import type { RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';

const h = vi.hoisted(() => ({ redis: null as FakeRedis | null, t: 1_000_000_000, create: vi.fn(), bg: [] as Promise<unknown>[] }));
vi.mock('@/lib/redis', async (orig) => ({
  fitsInRedis: (await orig<typeof import('@/lib/redis')>()).fitsInRedis,
  getRedisClient: () => h.redis,
  withRedis: async <T,>(fn: (r: FakeRedis) => Promise<T>, fallback: T) => (h.redis ? fn(h.redis) : fallback),
}));
vi.mock('openai', () => ({ default: class { chat = { completions: { create: h.create } }; } }));
vi.mock('@/server/llmBudget', () => ({ reserveLlmBudget: async () => ({ month: 'x', estimate: 1, store: 'memory' }), settleLlmBudget: async () => {} }));
vi.mock('@/server/backgroundTask', () => ({ runInBackground: (fn: () => Promise<unknown>) => h.bg.push(fn()) }));

import { buildRefereeReportMetrics, pctDiff } from './refereeReportMetrics';
import { buildRefereeReportUserMessage, validateRefereeReport } from '@/config/refereeReportPrompt';
import { getRefereeReport, leagueNameTr, REGEN_MIN_SECONDS } from './refereeReport';

const row = (p: Partial<RefereeSeasonTableRow>): RefereeSeasonTableRow => ({
  seasonId: 1, seasonName: '2025/2026', leagueId: 600, startingAt: null, matches: 10,
  yellowPerMatch: 4, redPerMatch: 0.1, penaltiesPerMatch: 0.3, foulsPerMatch: 25, varPerMatch: 0.2, ...p,
});

function page(over: Partial<RefereePageData> = {}): RefereePageData {
  return {
    id: 7, name: 'Test Hakem', country: { name: 'Türkiye' },
    summary: { totalMatches: 50, seasonCount: 3, context: { seasonId: 3, seasonName: '2026/2027', leagueId: 600, matches: 7, rates: { yellow: 4.57, red: 0.14, penalties: 0.29, var: 0.43 }, leagueAvg: { yellow: 4.16, red: 0.2, penalties: 0.3, var: 0.5 } } },
    seasons: [
      row({ seasonId: 3, seasonName: '2026/2027', matches: 7, yellowPerMatch: 4.57, redPerMatch: 0.14, penaltiesPerMatch: 0.29, foulsPerMatch: 26, varPerMatch: 0.43 }),
      row({ seasonId: 31, seasonName: '2026/2027', leagueId: 2, matches: 2, yellowPerMatch: 3 }),
      row({ seasonId: 2, seasonName: '2025/2026', matches: 20, yellowPerMatch: 4 }),
      row({ seasonId: 1, seasonName: '2024/2025', matches: 21, yellowPerMatch: 3, foulsPerMatch: 30 }),
      row({ seasonId: 0, seasonName: '2023/2024', matches: 5 }),
    ],
    recent: [
      { id: 1, status: 'FT', home: { id: 34, name: 'Galatasaray' }, away: { id: 9, name: 'X' }, scores: { score: '2 - 1' }, competition: { id: 600, name: 'Super Lig' }, date: '2026-11-01' },
      { id: 2, status: 'FT', home: { id: 9, name: 'X' }, away: { id: 8, name: 'Y' }, scores: { score: '0 - 0' }, competition: { id: 600, name: 'Super Lig' }, date: '2026-10-20' },
      { id: 3, status: 'FT', home: { id: 5, name: 'Z' }, away: { id: 6, name: 'W' }, scores: { score: '1 - 3' }, competition: { id: 2, name: 'UCL' }, date: '2026-10-10' },
    ] as RefereePageData['recent'],
    teams: {
      defaultSeason: '2026/2027',
      seasons: [{ seasonName: '2026/2027', matchCount: 9, rows: [
        { teamId: 34, name: 'Galatasaray', matches: 3, yellow: 6, red: 0, penaltiesFor: 2 },
        { teamId: 88, name: 'Fenerbahçe', matches: 1, yellow: 1, red: 0, penaltiesFor: 0 },
        { teamId: 9, name: 'X', matches: 4, yellow: 12, red: 1, penaltiesFor: 1 },
        { teamId: 8, name: 'Y', matches: 2, yellow: 5, red: 0, penaltiesFor: 0 },
      ] }],
    },
    ...over,
  };
}

describe('buildRefereeReportMetrics', () => {
  const m = buildRefereeReportMetrics(page(), leagueNameTr);

  it('güncel sezon: yüzde fark, olay sayısı, küçük örneklem', () => {
    expect(pctDiff(4.57, 4.16)).toBe(9.9);
    const y = m.currentSeason!.metrics.find((x) => x.key === 'yellow')!;
    expect(y).toMatchObject({ value: 4.57, leagueAvg: 4.16, diffPct: 9.9, events: 32, smallSample: true });
    expect(m.currentSeason!.metrics.find((x) => x.key === 'red')!.events).toBe(1);
    expect(m.mainLeague?.name).toBe('Süper Lig');
  });

  it('trend: yalnız ana lig, en yeni 3 sezon; ağırlıklı ortalama ve faul başına sarı', () => {
    expect(m.trend.map((t) => t.seasonName)).toEqual(['2026/2027', '2025/2026', '2024/2025']);
    expect(m.trend[2]!.yellowPerFoul).toBe(0.1);
    // (4.57×7 + 4×20 + 3×21) / 48 = 3.645… → 3.65
    expect(m.weighted).toMatchObject({ matches: 48, rates: { yellow: 3.65 } });
    expect(m.otherCompetitions.map((o) => o.league)).toEqual(["Şampiyonlar Ligi"]);
  });

  it('takım kırılımı: toplamlar, büyük 4 / diğerleri, sezon tablosu karşılaştırması', () => {
    const t = m.teams!;
    expect(t.totals).toEqual({ yellow: 24, red: 1, penaltiesFor: 3 });
    expect(t.big4).toMatchObject({ teams: 2, teamMatches: 4, yellow: 7, yellowPerTeamMatch: 1.75, penaltiesFor: 2 });
    expect(t.others).toMatchObject({ teamMatches: 6, yellow: 17, yellowPerTeamMatch: 2.83 });
    // 2026/2027 bütün ligler: 4.57×7 + 3×2 = 37.99 → 38 sarı; kırmızı 0.14×7 + 0.1×2 = 1.18 → 1
    expect(t.seasonTableTotals).toEqual({ matches: 9, yellow: 38, red: 1, penalties: 3 });
    expect(t.highCardTeams[0]!.name).toBe('X');
  });

  it('son maçlar: yalnız ana lig maçları sayılır', () => {
    expect(m.recent).toMatchObject({ matches: 2, goals: 3, goalsPerMatch: 1.5, homeWins: 1, draws: 1, awayWins: 0 });
    expect(m.recent.teams).toEqual([{ name: 'X', count: 2 }]);
    expect(m.recent.pairs).toHaveLength(3);
  });

  it('kullanıcı mesajı Türkçe sayı biçiminde ve örneklem işaretli', () => {
    const msg = buildRefereeReportUserMessage(m);
    expect(msg).toContain('Sarı kart/maç: 4,57 | lig ort.: 4,16 | fark: %9,9 üstünde');
    expect(msg).toContain('ÖRNEKLEM KÜÇÜK');
    expect(msg).toContain('Büyük 4: 2 takım');
  });
});

describe('validateRefereeReport', () => {
  it('boş alanları eler, eksik özet hata', () => {
    const ok = validateRefereeReport({ summary: ' s ', conclusion: 'c', currentSeason: ['a', ''], trend: [], competitions: [], teams: [], recent: [], dataNotes: [] });
    expect(ok.currentSeason).toEqual(['a']);
    expect(() => validateRefereeReport({ summary: '', conclusion: 'c' })).toThrow();
    const g = validateRefereeReport({ summary: 's', conclusion: 'c', currentSeason: ['a', 'iddaa kuponu için banko'], trend: [], competitions: [], teams: [], recent: [], dataNotes: [] });
    expect(g.currentSeason).toEqual(['a']);
  });
});

const REPORT = { summary: 'Özet.', conclusion: 'Sonuç.', currentSeason: ['a'], trend: ['b'], competitions: [], teams: [], recent: [], dataNotes: [] };
const reply = () => ({ choices: [{ message: { content: JSON.stringify(REPORT) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });

describe('getRefereeReport', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test';
    h.t = 1_000_000_000;
    h.redis = createFakeRedis(() => h.t);
    h.create.mockReset().mockImplementation(async () => reply());
    h.bg = [];
  });
  const deps = (p: RefereePageData | null = page()) => ({ now: () => h.t, loadPage: async () => p });

  it('sayfa verisi yoksa / yetersizse üretmez', async () => {
    expect(await getRefereeReport(7, deps(null))).toEqual({ status: 'unavailable' });
    expect(await getRefereeReport(7, deps(page({ seasons: [] })))).toEqual({ status: 'unavailable' });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('ilk istek üretir, ikinci önbellekten', async () => {
    const a = await getRefereeReport(7, deps());
    expect(a.status).toBe('ready');
    expect(a.status === 'ready' && a.data.report.summary).toBe('Özet.');
    expect(a.status === 'ready' && a.data.trend).toHaveLength(3);
    await getRefereeReport(7, deps());
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it('veri değişince eski rapor hemen; yenisi en erken 24 sa sonra arka planda', async () => {
    await getRefereeReport(7, deps());
    const changed = page({ summary: { ...page().summary, totalMatches: 51 } });
    h.t += 60_000;
    expect((await getRefereeReport(7, deps(changed))).status).toBe('ready');
    expect(h.bg).toHaveLength(0);
    h.t += REGEN_MIN_SECONDS * 1000;
    expect((await getRefereeReport(7, deps(changed))).status).toBe('ready');
    await Promise.all(h.bg);
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it('model hatası → unavailable; kilit başkasındaysa → pending', async () => {
    h.create.mockRejectedValueOnce(new Error('x'));
    expect(await getRefereeReport(7, deps())).toEqual({ status: 'unavailable' });
    let release!: () => void;
    h.create.mockImplementationOnce(() => new Promise((r) => (release = () => r(reply()))));
    const first = getRefereeReport(7, deps());
    await new Promise((r) => setTimeout(r, 10));
    expect(await getRefereeReport(7, deps())).toEqual({ status: 'pending' });
    release();
    expect((await first).status).toBe('ready');
  });
});
