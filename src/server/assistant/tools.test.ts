import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ card: null as unknown, calls: [] as string[], finished: null as unknown }));

vi.mock('@/services/liveScoreService', () => ({
  getAllLiveMatches: vi.fn(async () => []),
  getCompetitionTableFull: vi.fn(async () => ({ table: [{ rank: 1, team: { id: 34, name: 'Galatasaray' }, matches: 6, won: 4, drawn: 1, lost: 1, goal_diff: 3, points: 13 }] })),
  getTopScorers: vi.fn(async () => ({ topscorers: [{ goals: 6, assists: 2, played: 4, player: { name: 'Victor Osimhen ' }, team: { name: 'Galatasaray' } }, { goals: 0, assists: 5, player: { name: 'Pasör' }, team: { name: 'X' } }] })),
  lookupSportmonksFixture: vi.fn(async (id: string) => (id === '77' ? h.finished : { kind: 'found', match: { id: Number(id), status: 'NOT STARTED', ...(id === '1' ? { tv_stations: ['beIN Sports 1'] } : {}) }, events: [] })),
  getTeamsHead2Head: vi.fn(async (a: string, b: string) => {
    h.calls.push(`h2h:${a}:${b}`);
    const row = (date: string, home: string, away: string, score: string) => ({ id: date, date, home_name: home, away_name: away, score });
    return {
      team1: { id: a, name: 'Galatasaray' },
      team2: { id: b, name: 'Fenerbahçe' },
      h2h: [
        row('2026-04-01', 'Galatasaray', 'Fenerbahçe', '2-1'),
        row('2025-12-01', 'Fenerbahçe', 'Galatasaray', '0-0'),
        row('2025-09-01', 'Fenerbahçe', 'Galatasaray', '3-1'),
        row('2025-04-01', 'Galatasaray', 'Fenerbahçe', '1-0'),
        row('2024-12-01', 'Fenerbahçe', 'Galatasaray', '1-2'),
        row('2024-09-01', 'Galatasaray', 'Fenerbahçe', '4-4'), // 6. maç: limit dışı
        { id: 'x', date: '2026-11-01', home_name: 'Galatasaray', away_name: 'Fenerbahçe' }, // oynanmamış
      ],
    };
  }),
}));
vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_base: string, path: string) => {
    h.calls.push(`req:${path}`);
    return { data: path.toLowerCase().includes('icardi') ? [{ id: 5, display_name: 'Icardi Junior' }, { id: 9, display_name: 'Mauro Icardi', common_name: 'Icardi\u00a0' }] : [] };
  }),
}));
vi.mock('@/services/playerProfile', () => ({
  getPlayerProfile: vi.fn(async (id: number) => {
    h.calls.push(`player:${id}`);
    const row = (seasonName: string, leagueName: string, stats: Record<number, unknown>) => ({ key: leagueName, isCup: false, seasonId: 1, seasonName, leagueName, teamId: 34, teamName: 'Galatasaray', stats });
    return {
      id,
      name: 'Mauro Icardi\u00a0',
      position: 'Attacker',
      detailedPosition: 'Centre Forward',
      currentTeam: { id: 34, name: 'Galatasaray' },
      seasons: [
        row('2026/2027', 'Süper Lig', { 321: { total: 8 }, 52: { total: 5, goals: 4, penalties: 1 } }),
        row('2026/2027', 'Champions League', { 321: { total: 3 }, 79: { total: 2 } }),
        row('2026/2027', 'Türkiye Kupası', { 119: { total: 12 } }), // maç sayısı yok → atlanır
        row('2025/2026', 'Süper Lig', { 321: { total: 30 }, 52: { total: 20 } }), // geçen sezon → modele gitmez
      ],
      transfers: [],
    };
  }),
}));
const fixture = { id: 1, home: { id: 34, name: 'Galatasaray' }, away: { id: 1071, name: 'Kasımpaşa' }, status: 'NOT STARTED', date: '2026-10-09', scheduled: '17:00', competition: { id: 600, name: 'Süper Lig' } };
const played = { ...fixture, id: 77, away: { id: 286, name: 'Gençlerbirliği' }, status: 'FINISHED', kickoff_ts: Date.parse('2026-10-17T13:00:00Z') };
vi.mock('@/services/teamPage', () => ({
  getTeamOverview: vi.fn(async () => ({ team: { id: 34, name: 'Galatasaray' }, recent: [played], fixtures: [fixture, { ...fixture, id: 9, competition: { id: 2, name: 'Şampiyonlar Ligi' } }, { ...fixture, id: 10 }], campaigns: [] })),
}));
vi.mock('@/services/sportmonks/teamOverview', () => ({ teamForm: () => [] }));
vi.mock('@/server/homeDay', () => ({
  loadHomeDay: vi.fn(async (date: string) => {
    h.calls.push(`day:${date}`);
    const cup = { ...fixture, id: 3, competition: { id: 606, name: 'Türkiye Kupası' } };
    const sl = date === '2026-10-09' ? [fixture] : [];
    // Bugün: PL + Türkiye Kupası (Süper Lig maçı YOK); 9 Ekim: Süper Lig.
    return { date, fixtureMatches: date === '2026-10-06' ? [{ ...fixture, id: 2, competition: { id: 8, name: 'Premier League' } }, cup] : sl, liveMatches: [] };
  }),
  loadUpcomingMatchDays: vi.fn(async (_from: string, leagueIds: number[] | null) => {
    h.calls.push(`upcoming:${(leagueIds ?? []).join(',')}`);
    return (leagueIds ?? []).includes(600) ? [{ leagueId: 600, date: '2026-10-09' }] : (leagueIds ?? []).includes(82) ? [{ leagueId: 82, date: '2026-10-20' }] : [];
  }),
}));
vi.mock('@/server/analysisTeamAbsences', () => ({ getTeamAbsences: vi.fn(async () => null) }));
vi.mock('./matchAnalysisRequest', async (orig) => ({
  pickFixtures: (await orig<typeof import('./matchAnalysisRequest')>()).pickFixtures,
  resolveTeam: vi.fn(async (q: string) => ({ GS: [{ id: 34, name: 'Galatasaray' }], FB: [{ id: 88, name: 'Fenerbahçe' }], 'Gençlerbirliği': [{ id: 286, name: 'Gençlerbirliği' }] })[q] ?? []),
  analysisCardForTeams: vi.fn(async (viewer: unknown) => {
    h.calls.push(`viewer:${viewer == null ? 'none' : (viewer as { id: string }).id}`);
    return h.card;
  }),
}));

import { ASSISTANT_LEAGUES, ASSISTANT_TOOLS, TURKEY_LEAGUE_IDS, openAiToolDefinitions, runAssistantTool, type ToolContext } from './tools';
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
    h.finished = null;
  });

  it('v2.1 araç seti; tanımlar katı şemalı ve bahis terimsiz; lig listesi plan liglerinden', () => {
    expect(Object.keys(ASSISTANT_TOOLS)).toEqual(['find_team', 'get_fixtures', 'get_live_scores', 'get_standings', 'get_top_scorers', 'get_team_overview', 'get_match_analysis', 'get_head_to_head', 'get_player', 'get_match_detail', 'get_rules', 'get_site_help']);
    // Lig listesi sitenin lig tablosundan türetilir (34 lig, lig sekmeleriyle aynı adlar).
    expect(Object.keys(ASSISTANT_LEAGUES).map(Number).sort()).toEqual([...PLAN_SPORTMONKS_LEAGUE_IDS].sort());
    expect(ASSISTANT_LEAGUES[600]).toBe('Süper Lig');
    expect(ASSISTANT_LEAGUES[1283]).toBe('2. Lig Kırmızı');
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
    // Kanal maç detayıyla aynı kaynaktan (lookupSportmonksFixture), sıradaki 2 maç için; yoksa tv_note.
    const up = (r.data as { team: string; upcoming: Array<Record<string, unknown>> }).upcoming;
    expect((r.data as { team: string }).team).toBe('Galatasaray');
    expect(up).toHaveLength(3);
    expect(up[0]).toMatchObject({ match_id: 1, date: '2026-10-09', time_tr: '20:00', tv: ['beIN Sports 1'], league: 'Süper Lig' });
    expect(up[1]).toMatchObject({ match_id: 9, tv_note: 'not_announced', league: 'Şampiyonlar Ligi' });
    expect(up[2]).not.toHaveProperty('tv_note');
    const { lookupSportmonksFixture } = await import('@/services/liveScoreService');
    expect(vi.mocked(lookupSportmonksFixture).mock.calls.map((c) => c[0])).toEqual(['1', '9']);
    expect(r.card?.type).toBe('matches');
    expect((r.card as { matches: Array<Record<string, unknown>> }).matches[0]).toMatchObject({ id: 1, league: 'Süper Lig', tv: ['beIN Sports 1'] });
    for (const l of r.links ?? []) expect(isAllowedLinkHref(l.href), l.href).toBe(true);
  });

  it('get_fixtures (gün): varsayılan bugün, Türk ligleri önce; "Türkiye" kapsamı bütün Türk ligleri (yalnız Süper Lig değil)', async () => {
    const all = await run('get_fixtures', {});
    expect(h.calls).toEqual(['day:2026-10-06']);
    expect((all.data as { matches: Array<{ match_id: number }> }).matches.map((m) => m.match_id)).toEqual([3, 2]);
    const tr = await run('get_fixtures', { scope: 'turkey' });
    expect(tr.data).toMatchObject({ scope: 'Türkiye', total: 1, matches: [{ match_id: 3, league: 'Türkiye Kupası' }] });
    expect(tr.card).toMatchObject({ type: 'matches' });
    expect(TURKEY_LEAGUE_IDS).toEqual([600, 603, 606, 1282, 1283]);
    for (const id of TURKEY_LEAGUE_IDS) expect(PLAN_SPORTMONKS_LEAGUE_IDS).toContain(id);
  });

  it('get_fixtures (lig): bugün maç yoksa önümüzdeki 7 günde en yakın maç günü listelenir; yoksa net "maç yok" yanıtı + Tüm maçlar linki', async () => {
    // Süper Lig bugün yok → 9 Ekim (3 gün sonra) listelenir; lig takvimi önbellekli (loadUpcomingMatchDays).
    const sl = await run('get_fixtures', { league_id: 600, upcoming: true });
    expect(h.calls).toEqual(['day:2026-10-06', 'upcoming:600', 'day:2026-10-09']);
    expect(sl.data).toMatchObject({ date: '2026-10-09', requested_date: '2026-10-06', scope: 'Süper Lig', total: 1, note: 'no_match_today_next_day_listed', matches: [{ match_id: 1 }] });
    expect(sl.card).toMatchObject({ type: 'matches' });
    // Bundesliga: bugün yok, ilk maç 20 Ekim (7 günden uzak) → sabit yanıt, kart yok, "Tüm maçlar" linki.
    const pl = await run('get_fixtures', { league_id: 82 });
    expect(pl.data).toMatchObject({ matches: [], note: 'none_in_lookahead', lookahead_days: 7, next_match_day: '2026-10-20' });
    expect(pl.reply).toBe('Önümüzdeki 7 günde Bundesliga maçı yok. İlk maç günü: 2026-10-20.');
    expect(pl.card).toBeUndefined();
    expect(pl.links).toEqual([{ label: 'Tüm maçlar', href: '/' }]);
    // Belirli bir geçmiş/ileri tarih istendiğinde ileriye bakılmaz.
    expect((await run('get_fixtures', { date: '2026-10-10', league_id: 8 })).data).toMatchObject({ total: 0 });
    expect(h.calls.filter((c) => c.startsWith('upcoming')).length).toBe(2);
  });

  it('puan durumu ve krallık (asist türü ayrı sıralanır)', async () => {
    const st = await run('get_standings', { league_id: 600 });
    expect(st.data).toMatchObject({ league: 'Süper Lig', rows: [{ rank: 1, team: 'Galatasaray', points: 13 }] });
    // Tablo kartı: ilk 8 satır (sıra, takım, O, P) + tüm puan durumu linki.
    expect(st.card).toEqual({ type: 'standings', league: 'Süper Lig', rows: [{ rank: 1, team: 'Galatasaray', played: 6, points: 13 }], href: '/standings' });
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
    h.card = { kind: 'none', match, reason: 'scheduled', signedIn: false, cost: 1 };
    const ready = await run('get_match_analysis', { home_team: 'GS', away_team: 'Kasımpaşa' });
    expect(ready.data).toMatchObject({ status: 'not_ready', message_for_user: expect.stringContaining('yaklaşık 3 saat önce') });
    expect(ready.reply).toBe('Bu maçın analizi henüz hazır değil. Analiz maçtan yaklaşık 3 saat önce hazırlanır.');
    h.card = { kind: 'none', match, reason: 'self-serve', signedIn: false, cost: 1 };
    const self = await run('get_match_analysis', { home_team: 'Banfield', away_team: 'Rosario Central' });
    expect(self.data).toMatchObject({ status: 'self_serve', message_for_user: 'Bu maç için hazır analiz yok. Maç sayfasından 1 krediyle kendin üretebilirsin.' });
    expect(self.reply).toBe('Bu maç için hazır analiz yok. Maç sayfasından 1 krediyle kendin üretebilirsin.');
    expect(JSON.stringify(self.data)).not.toMatch(/3 saat|3 hours/);
    expect((await run('get_match_analysis', { home_team: 'Banfield', away_team: 'Rosario Central' }, { ...ctx, locale: 'en' })).reply).toContain('You can generate one yourself on the match page for 1 credit.');
    h.card = { kind: 'none', match, reason: 'not-planned', signedIn: false, cost: 1 };
    expect((await run('get_match_analysis', { home_team: 'A', away_team: 'B' })).reply).toBe('Bu maç için analiz hazırlanmıyor.');
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
    expect(help.links).toEqual([{ label: 'Krediler', href: '/pricing' }]);
    for (const topic of ['credits', 'analysis', 'account', 'assistant', 'premium']) {
      const data = JSON.stringify((await run('get_site_help', { topic })).data);
      expect(findGamblingTerms(data)).toEqual([]);
      expect(data, topic).not.toMatch(/premium/i); // premium satışı kapalı; eski konu adı genel yardıma düşer
    }
  });

  it('get_head_to_head: ad ya da id; son 5 oynanmış karşılaşma, G/B/M ve goller team_a açısından; karşılaştırma linki', async () => {
    const r = await run('get_head_to_head', { team_a: 'GS', team_b: 'FB' });
    expect(h.calls).toEqual(['h2h:34:88']);
    expect(r.data).toMatchObject({ team_a: 'Galatasaray', team_b: 'Fenerbahçe', last_meetings: 5, team_a_wins: 3, draws: 1, team_b_wins: 1, goals_team_a: 6, goals_team_b: 5 });
    const rows = (r.data as { matches_newest_first: Array<{ date: string; score: string }> }).matches_newest_first;
    expect(rows.map((x) => x.date)).toEqual(['2026-04-01', '2025-12-01', '2025-09-01', '2025-04-01', '2024-12-01']);
    expect(r.links).toEqual([{ label: 'Galatasaray – Fenerbahçe karşılaştırma', href: '/compare/34-vs-88' }]);
    expect((await run('get_head_to_head', { team_a: '34', team_b: 88 })).ok).toBe(true);
    expect(h.calls.at(-1)).toBe('h2h:34:88');
    expect((await run('get_head_to_head', { team_a: 'Bilinmez', team_b: 'FB' })).data).toEqual({ note: 'team_not_found', missing: 'team_a' });
    expect((await run('get_head_to_head', { team_a: 34, team_b: 34 })).ok).toBe(false);
  });

  it('get_player: arama tek istek, tam ad öne; yalnız bu sezon (maç sayısı olan satırlar), sıfır gol/asist 0; NBSP kırpılır; kapsam notu', async () => {
    const r = await run('get_player', { query: 'Icardi' });
    expect(h.calls).toEqual(['req:/players/search/Icardi', 'player:9']);
    expect(r.data).toMatchObject({
      player_id: 9,
      name: 'Mauro Icardi',
      team: 'Galatasaray',
      position: 'Centre Forward',
      season: '2026/2027',
      season_stats: [
        { competition: 'Süper Lig', apps: 8, goals: 5, assists: 0 },
        { competition: 'Champions League', apps: 3, goals: 0, assists: 2 },
      ],
      other_matches: [{ player_id: 5, name: 'Icardi Junior' }],
    });
    expect((r.data as { season_stats: unknown[] }).season_stats).toHaveLength(2);
    expect((r.data as { coverage_note: string }).coverage_note).toMatch(/Kariyer/);
    expect(r.links).toEqual([{ label: 'Mauro Icardi', href: '/players/9' }]);
    h.calls = [];
    await run('get_player', { player_id: 455805 });
    expect(h.calls).toEqual(['player:455805']);
    expect((await run('get_player', { query: 'zzzz' })).data).toEqual({ players: [], note: 'not_found' });
    expect((await run('get_player', { query: 'ab' })).ok).toBe(false);
  });

  it('get_match_detail: takım adlarıyla son oynanmış maç bulunur; kart SAYISI istatistikten (TD kartı olaydan sayılmaz), goller olaylardan', async () => {
    const ev = (id: number, event: string, time: number, name: string, home: boolean, playerId = id) => ({ id, player: { id: playerId, name }, time, event, sort: time, info: null, is_home: home, is_away: !home });
    h.finished = {
      kind: 'found',
      match: { ...played, scores: { score: '0 - 1', ht_score: '0 - 0' }, home: { id: 286, name: 'Gençlerbirliği' }, away: { id: 34, name: 'Galatasaray' } },
      events: [
        ev(1, 'GOAL', 88, 'İrfan Can Eğribayat ', false),
        ev(2, 'RED_CARD', 90, 'Teknik Direktör', true, 0), // TD kartı: player_id yok
        ev(3, 'YELLOW_RED_CARD', 70, 'Oyuncu A', true),
        ev(4, 'SUBSTITUTION', 60, 'Oyuncu B', true),
      ],
      stats: { possesion: '41:59', red_cards: '1:0', yellow_cards: '3:2', attempts_on_goal: '8:15', corners: '2:7' },
    };
    const r = await run('get_match_detail', { home_team: 'Gençlerbirliği', away_team: 'GS' });
    expect(r.data).toMatchObject({
      match_id: 77,
      score: '0 - 1',
      ht_score: '0 - 0',
      status: 'FINISHED',
      goals: [{ minute: 88, player: 'İrfan Can Eğribayat', team: 'away' }],
      red_card_players: [{ minute: 70, player: 'Oyuncu A', team: 'home', second_yellow: true }],
      stats_home_away: { possession_pct: [41, 59], red_cards: [1, 0], yellow_cards: [3, 2], shots: [8, 15], corners: [2, 7] },
    });
    expect(r.card).toMatchObject({ type: 'matches', matches: [{ id: 77 }] });
    expect(r.links?.[0]?.href).toMatch(/^\/matches\/77-/);
    // Tarih süzgeci: o gün maç yoksa bulunamadı.
    expect((await run('get_match_detail', { home_team: 'Gençlerbirliği', away_team: 'GS', date: '2026-10-01' })).data).toMatchObject({ note: 'match_not_found_in_recent_or_upcoming' });
    // match_id doğrudan; oynanmamış maçta yalnız saat + not.
    expect((await run('get_match_detail', { match_id: 1 })).data).toMatchObject({ match_id: 1, note: 'not_started' });
    expect((await run('get_match_detail', {})).ok).toBe(false);
  });
});
