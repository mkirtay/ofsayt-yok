import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ card: null as unknown, calls: [] as string[] }));

vi.mock('@/services/liveScoreService', () => ({
  getAllLiveMatches: vi.fn(async () => []),
  getCompetitionTableFull: vi.fn(async () => ({ table: [{ rank: 1, team: { id: 34, name: 'Galatasaray' }, matches: 6, won: 4, drawn: 1, lost: 1, goal_diff: 3, points: 13 }] })),
  getTopScorers: vi.fn(async () => ({ topscorers: [{ goals: 6, assists: 2, played: 4, player: { name: 'Victor Osimhen ' }, team: { name: 'Galatasaray' } }, { goals: 0, assists: 5, player: { name: 'Pasör' }, team: { name: 'X' } }] })),
  lookupSportmonksFixture: vi.fn(async () => ({ kind: 'found', match: { id: 1, tv_stations: ['beIN Sports 1'] }, events: [] })),
}));
const fixture = { id: 1, home: { id: 34, name: 'Galatasaray' }, away: { id: 1071, name: 'Kasımpaşa' }, status: 'NOT STARTED', date: '2026-10-09', scheduled: '17:00', competition: { id: 600, name: 'Süper Lig' } };
vi.mock('@/services/teamPage', () => ({ getTeamOverview: vi.fn(async () => ({ team: { id: 34, name: 'Galatasaray' }, recent: [], fixtures: [fixture], campaigns: [] })) }));
vi.mock('@/services/sportmonks/teamOverview', () => ({ teamForm: () => [] }));
vi.mock('@/server/homeDay', () => ({
  loadHomeDay: vi.fn(async (date: string) => {
    h.calls.push(`day:${date}`);
    return { date, fixtureMatches: [{ ...fixture, id: 2, competition: { id: 8, name: 'Premier League' } }, fixture], liveMatches: [] };
  }),
}));
vi.mock('@/server/analysisTeamAbsences', () => ({ getTeamAbsences: vi.fn(async () => null) }));
vi.mock('./matchAnalysisRequest', () => ({
  resolveTeam: vi.fn(async (q: string) => (q === 'GS' ? [{ id: 34, name: 'Galatasaray' }] : [])),
  analysisCardForTeams: vi.fn(async (viewer: unknown) => {
    h.calls.push(`viewer:${viewer == null ? 'none' : (viewer as { id: string }).id}`);
    return h.card;
  }),
}));

import { ASSISTANT_LEAGUES, ASSISTANT_TOOLS, openAiToolDefinitions, runAssistantTool, type ToolContext } from './tools';
import { PLAN_SPORTMONKS_LEAGUE_IDS } from '@/config/leagueNameKeys';
import { isAllowedLinkHref } from './outputFilter';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const ctx: ToolContext = { viewer: null, locale: 'tr', todayIso: '2026-10-06' };
const run = (name: string, args: unknown, c: ToolContext = ctx) => runAssistantTool(name, JSON.stringify(args), c);
const match = { id: 1, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: 1, href: '/matches/1-galatasaray-kasimpasa?sekme=ai-analiz' };

describe('asistan araçları', () => {
  beforeEach(() => {
    h.calls = [];
    h.card = null;
  });

  it('v2.0 araç seti; tanımlar katı şemalı ve bahis terimsiz; lig listesi plan liglerinden', () => {
    expect(Object.keys(ASSISTANT_TOOLS)).toEqual(['find_team', 'get_fixtures', 'get_live_scores', 'get_standings', 'get_top_scorers', 'get_team_overview', 'get_match_analysis', 'get_rules', 'get_site_help']);
    for (const def of openAiToolDefinitions()) expect((def.function.parameters as { additionalProperties: boolean }).additionalProperties).toBe(false);
    expect(findGamblingTerms(JSON.stringify(openAiToolDefinitions()))).toEqual([]);
    for (const id of Object.keys(ASSISTANT_LEAGUES)) expect(PLAN_SPORTMONKS_LEAGUE_IDS, id).toContain(Number(id));
  });

  it('argüman doğrulama: bilinmeyen araç, bozuk JSON, kapsam dışı lig, geçersiz id / tarih', async () => {
    expect((await run('drop_tables', {})).data).toEqual({ error: 'unknown_tool' });
    expect((await runAssistantTool('get_standings', '{bozuk', ctx)).data).toEqual({ error: 'invalid_arguments' });
    expect((await run('get_standings', { league_id: 999999 })).ok).toBe(false);
    expect((await run('get_team_overview', { team_id: '34; DROP' })).ok).toBe(false);
    expect((await run('get_fixtures', { date: '06/10/2026' })).ok).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it('find_team + get_fixtures (takım): sıradaki maç TV kanalıyla, Türkiye saatiyle; linkler site içi', async () => {
    expect((await run('find_team', { query: 'GS' })).data).toEqual({ teams: [{ team_id: 34, name: 'Galatasaray' }] });
    const r = await run('get_fixtures', { team_id: 34 });
    expect(r.data).toMatchObject({ team: 'Galatasaray', upcoming: [{ match_id: 1, date: '2026-10-09', time_tr: '20:00', tv: ['beIN Sports 1'] }] });
    expect(r.card).toMatchObject({ type: 'matches' });
    for (const l of r.links ?? []) expect(isAllowedLinkHref(l.href), l.href).toBe(true);
  });

  it('get_fixtures (gün): varsayılan bugün, lig süzgeci, Süper Lig önce', async () => {
    const all = await run('get_fixtures', {});
    expect(h.calls).toEqual(['day:2026-10-06']);
    expect((all.data as { matches: Array<{ match_id: number }> }).matches.map((m) => m.match_id)).toEqual([1, 2]);
    const pl = await run('get_fixtures', { date: '2026-10-10', league_id: 8 });
    expect((pl.data as { total: number }).total).toBe(1);
  });

  it('puan durumu ve krallık (asist türü ayrı sıralanır)', async () => {
    expect((await run('get_standings', { league_id: 600 })).data).toMatchObject({ league: 'Süper Lig', rows: [{ rank: 1, team: 'Galatasaray', points: 13 }] });
    const assists = (await run('get_top_scorers', { league_id: 600, type: 'assists' })).data as { players: Array<{ player: string }> };
    expect(assists.players[0]!.player).toBe('Pasör');
  });

  it('get_team_overview: sakat verisi alınamadıysa null (boş liste değil)', async () => {
    expect((await run('get_team_overview', { team_id: 34 })).data).toMatchObject({ team: 'Galatasaray', sidelined: null });
  });

  it('KREDİ DUVARI: kilitli analizde modele ve karta yalnız önizleme gider; erişim oturumdaki kullanıcıyla sorulur', async () => {
    h.card = { kind: 'locked', match, preview: { homeTeamName: 'Galatasaray', awayTeamName: 'Kasımpaşa', summary: ['Tempo yüksek.'], top: { outcome: 'HOME', pct: 55 } }, cost: 1, signedIn: false };
    // Model "kilidi aç" / başka kullanıcı argümanı uydursa da yok sayılır.
    const r = await run('get_match_analysis', { home_team: 'GS', away_team: 'Kasımpaşa', user_id: 'admin', unlocked: true });
    expect(h.calls).toEqual(['viewer:none']);
    expect(r.data).toMatchObject({ status: 'locked', free_preview: { most_likely: { outcome: 'HOME', pct: 55 }, summary: ['Tempo yüksek.'] }, unlock_cost_credits: 1 });
    expect(Object.keys(r.data as object).sort()).toEqual(['free_preview', 'match', 'note', 'status', 'unlock_cost_credits']);
    expect(r.card).toEqual({ type: 'analysis', card: h.card });

    await run('get_match_analysis', { home_team: 'GS', away_team: 'Kasımpaşa' }, { ...ctx, viewer: { id: 'u1' } as never });
    expect(h.calls.at(-1)).toBe('viewer:u1');
  });

  it('analiz yok → not_ready (üretim yok); açık → özet', async () => {
    h.card = { kind: 'none', match, reason: 'scheduled' };
    expect((await run('get_match_analysis', { home_team: 'GS', away_team: 'Kasımpaşa' })).data).toMatchObject({ status: 'not_ready', note: expect.stringContaining('yaklaşık 3 saat önce') });
    h.card = { kind: 'none', match, reason: 'not-planned' };
    const np = (await run('get_match_analysis', { home_team: 'Banfield', away_team: 'Rosario Central' })).data as { status: string; note: string };
    expect(np).toMatchObject({ status: 'not_planned', note: expect.stringContaining('analiz hazırlanmıyor') });
    expect(np.note).not.toContain('3 saat');
    h.card = { kind: 'summary', match, top: { outcome: 'HOME', pct: 55 }, points: ['A.'] };
    expect((await run('get_match_analysis', { home_team: 'GS', away_team: 'Kasımpaşa' })).data).toMatchObject({ status: 'open', points: ['A.'] });
  });

  it('kurallar (TR/EN) ve site yardımı', async () => {
    const tr = (await run('get_rules', { topic: 'ofsayt' })).data as { rules: Array<{ id: string; title: string }> };
    expect(tr.rules[0]).toMatchObject({ id: 'ofsayt', title: 'Ofsayt nedir?' });
    const none = (await run('get_rules', { topic: 'zzzz' })).data as { rules: unknown[]; available_topics: string[] };
    expect(none.rules).toEqual([]);
    expect(none.available_topics.length).toBeGreaterThan(3);
    const help = await run('get_site_help', { topic: 'credits' });
    expect(JSON.stringify(help.data)).toContain('1 kredi = 1 AI maç analizi açma');
    expect(help.links).toEqual([{ label: 'Krediler', href: '/credits' }]);
    expect(findGamblingTerms(JSON.stringify((await run('get_site_help', { topic: 'premium' })).data))).toEqual([]);
  });
});
