/**
 * Milli takım maçları (API-Football, id ≥ 2e9) için AI maç analizi bağlamı — kulüp yolundaki `buildMatchAnalysisContext`
 * ile AYNI çıktı tipini (`MatchAnalysisContext`) üretir; prompt/model değişmez.
 *
 * Veri kaynakları (hepsi tek sağlayıcı, AF; iç bütçe havuzu 'analysis'):
 *  - Takım penceresi: `fixtures?team=&season=` (maç yılı, -1, gerekirse -2) → son maçlar + sıradaki maç (dinlenme / seri / takvim).
 *  - H2H: `fixtures/headtohead?h2h=a-b`.
 *  - Turnuva-sezon fikstürü: `fixtures?league=&season=` → puan durumu (grup başına) ve takımın turnuva sezon özeti.
 *    `standings` / `teams/statistics` yerine fikstürden hesaplanır: AF'nin bu uçları yalnız "şimdiki" durumu verir, oysa bağlam
 *    maç tarihine göre olmalı (geriye dönük test için gelecekten sızıntı olmasın; canlıda da maç öncesi durumla birebir aynı).
 *
 * Milli maçta OLMAYANLAR (alan hiç eklenmez — kulüp yolunda `null` olan bölümler gibi prompt tarafından atlanır): sakat/cezalı
 * (`absences`), hakem istatistiği, hava, derbi, 1. ayak, gol dakikaları, takım golcüleri, oran sinyali. Bunlar yerine bağlama
 * `notes` bloğu eklenir (milli maç + kadro belirsizliği + hazırlık maçı rotasyonu); prompt metni değişmez.
 *
 * `historical: true` → maçın SONUCU/olayları/kadrosu/hakemi bağlama sızmaz (maç "başlamadı" gibi kurulur); yalnız maç öncesi
 * bilinebilecek veri kullanılır. Geriye dönük test betiği (scripts/national/backtest.ts) bunu kullanır.
 */
import type { Match } from '@/models/liveScore';
import type { CompetitionTableData, CompetitionTableStandingRow, Head2HeadData, Head2HHistoricalMatch } from '@/services/liveScoreService';
import type { TeamSeasonStats, SummaryLine } from '@/services/sportmonks/teamSeasonStats';
import { MINUTE_BUCKETS } from '@/services/sportmonks/teamSeasonStats';
import { isSeniorMenTeamName } from '@/config/nationalLeagues';
import { nationalTeamNameTr } from '@/config/nationalTeamNames';
import { normalizeTeamName } from '@/utils/displayName';
import { toAfId, toAppId } from '@/services/apiFootball/ids';
import { mapNationalFixture, mapNationalLineups, mapNationalMatch } from '@/services/apiFootball/mapper';
import type { AfFixture } from '@/services/apiFootball/types';
import { apiFootballGet, type AfEnvelope } from '@/server/apiFootball/client';
import {
  buildH2HContext,
  buildRecentMatchRow,
  computeMetrics,
  type ArchivedMatchContext,
  type MatchAnalysisContext,
  type RecentMatchRow,
  type TeamContext,
} from '@/server/buildMatchAnalysisContext';
import { buildMatchSituation } from '@/server/analysisMatchSituation';

export type AfGet = <T>(path: string, params: Record<string, string | number>) => Promise<AfEnvelope<T>>;

const FRIENDLIES_AF_ID = 10;
const FINISHED = new Set(['FT', 'AET', 'PEN']);
/** Eleme turu / play-off: puan durumu tablosu anlamsız, tur bilgisi anlamlı. */
const KNOCKOUT_ROUND = /play-?offs?|final|knockout|round of|1\/8|1\/4|quarter|semi|promotion|relegation|3rd place|preliminary/i;
const MAX_RECENT = 10;
const MAX_H2H = 10;

const kickoffMs = (f: AfFixture): number => Date.parse(f.fixture.date);
export const isFinishedFixture = (f: AfFixture): boolean => FINISHED.has(f.fixture.status.short) && f.goals.home != null && f.goals.away != null;
const isSenior = (f: AfFixture): boolean => isSenior_(f.teams.home.name) && isSenior_(f.teams.away.name);
const isSenior_ = (name: string): boolean => isSeniorMenTeamName(name);

function dedupe(fixtures: AfFixture[]): AfFixture[] {
  const seen = new Map<number, AfFixture>();
  for (const f of fixtures) if (!seen.has(f.fixture.id)) seen.set(f.fixture.id, f);
  return [...seen.values()];
}

/** Takımın pencere fikstürlerinden: maçtan ÖNCE oynanmış (yeni → eski) ve maçtan SONRA planlı (eski → yeni) olanlar. */
export function splitTeamFixtures(
  fixtures: AfFixture[],
  afTeamId: number,
  koMs: number,
  matchAfId: number,
): { played: AfFixture[]; upcoming: AfFixture[] } {
  const mine = dedupe(fixtures).filter(
    (f) => f.fixture.id !== matchAfId && isSenior(f) && (f.teams.home.id === afTeamId || f.teams.away.id === afTeamId) && Number.isFinite(kickoffMs(f)),
  );
  return {
    played: mine.filter((f) => kickoffMs(f) < koMs && isFinishedFixture(f)).sort((a, b) => kickoffMs(b) - kickoffMs(a)),
    upcoming: mine.filter((f) => kickoffMs(f) > koMs).sort((a, b) => kickoffMs(a) - kickoffMs(b)),
  };
}

export function recentRows(played: AfFixture[], appTeamId: number, limit = MAX_RECENT): RecentMatchRow[] {
  return played
    .map((f) => buildRecentMatchRow(mapNationalMatch(f), appTeamId))
    .filter((r): r is RecentMatchRow => r != null)
    .slice(0, limit);
}

/** H2H: maçtan önce bitmiş karşılaşmalar (en yeni başta, en çok 10). */
export function buildNationalH2H(fixtures: AfFixture[], koMs: number, homeApp: { id: number; name: string }, awayApp: { id: number; name: string }): MatchAnalysisContext['h2h'] {
  const rows = dedupe(fixtures)
    .filter((f) => kickoffMs(f) < koMs && isFinishedFixture(f))
    .sort((a, b) => kickoffMs(b) - kickoffMs(a))
    .slice(0, MAX_H2H);
  const h2h: Head2HHistoricalMatch[] = rows.map((f) => {
    const m = mapNationalMatch(f);
    return {
      id: String(m.id),
      date: m.date,
      home_name: m.home?.name,
      away_name: m.away?.name,
      score: m.scores?.score,
      ...(m.scores?.ht_score ? { ht_score: m.scores.ht_score } : {}),
    };
  });
  const data: Head2HeadData = { team1: { id: String(homeApp.id), name: homeApp.name }, team2: { id: String(awayApp.id), name: awayApp.name }, h2h };
  return buildH2HContext(data, homeApp.name);
}

type Tally = { id: number; name: string; p: number; w: number; d: number; l: number; gf: number; ga: number };

/**
 * Turnuva-sezon fikstüründen (maçtan önce bitenler) puan durumu. Gruplar: eleme turu OLMAYAN maçlarda karşılaşan takımlar
 * bağlı bileşen = grup. Beraberlik bozma: puan, averaj, atılan gol, ad (resmî kurallar [ikili maç vb.] uygulanmaz → tahmini sıra).
 */
export function computeStandingsAsOf(leagueFixtures: AfFixture[], koMs: number, league: { id: number; name: string; season: number }): CompetitionTableData | null {
  const groupFx = dedupe(leagueFixtures).filter((f) => isSenior(f) && !KNOCKOUT_ROUND.test(f.league.round ?? ''));
  if (groupFx.length === 0) return null;
  // Union-find: aynı gruptaki takımlar (grup maçı = fikstür, oynanıp oynanmadığına bakılmaz).
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const f of groupFx) parent.set(find(f.teams.home.id), find(f.teams.away.id));
  const tallies = new Map<number, Tally>();
  const tally = (t: { id: number; name: string }) => {
    let x = tallies.get(t.id);
    if (!x) tallies.set(t.id, (x = { id: t.id, name: t.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));
    return x;
  };
  for (const f of groupFx) {
    const h = tally(f.teams.home);
    const a = tally(f.teams.away);
    if (!(kickoffMs(f) < koMs && isFinishedFixture(f))) continue;
    const hg = f.goals.home!;
    const ag = f.goals.away!;
    h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.w++; a.l++; } else if (hg < ag) { a.w++; h.l++; } else { h.d++; a.d++; }
  }
  const groups = new Map<number, Tally[]>();
  for (const t of tallies.values()) {
    const g = find(t.id);
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  const toRows = (ts: Tally[]): CompetitionTableStandingRow[] =>
    [...ts]
      .sort((x, y) => y.w * 3 + y.d - (x.w * 3 + x.d) || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name))
      .map((t, i) => ({
        rank: i + 1,
        points: t.w * 3 + t.d,
        matches: t.p,
        goal_diff: t.gf - t.ga,
        goals_scored: t.gf,
        goals_conceded: t.ga,
        won: t.w,
        drawn: t.d,
        lost: t.l,
        team: { id: toAppId(t.id), name: nationalTeamNameTr(normalizeTeamName(t.name)) },
        team_id: toAppId(t.id),
        name: nationalTeamNameTr(normalizeTeamName(t.name)),
      }));
  const ordered = [...groups.values()].sort((a, b) => Math.min(...a.map((t) => t.id)) - Math.min(...b.map((t) => t.id)));
  const base = { competition: { id: toAppId(league.id), name: league.name }, season: { name: String(league.season) } };
  return ordered.length === 1
    ? { ...base, table: toRows(ordered[0]!) }
    : { ...base, stages: [{ groups: ordered.map((g, i) => ({ id: i + 1, name: `Grup ${i + 1}`, standings: toRows(g) })) }] };
}

/** Takımın turnuva sezon özeti (maçtan önce bitenler); hiç maç yoksa null. Gol dakikası yok (fikstürde bulunmaz). */
export function computeTeamSeasonStatsAsOf(leagueFixtures: AfFixture[], afTeamId: number, koMs: number, league: { id: number; season: number }): TeamSeasonStats | null {
  const zero = (): SummaryLine => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });
  const total = zero();
  const home = zero();
  const away = zero();
  for (const f of dedupe(leagueFixtures)) {
    if (!isSenior(f) || kickoffMs(f) >= koMs || !isFinishedFixture(f)) continue;
    const isHome = f.teams.home.id === afTeamId;
    if (!isHome && f.teams.away.id !== afTeamId) continue;
    const gf = isHome ? f.goals.home! : f.goals.away!;
    const ga = isHome ? f.goals.away! : f.goals.home!;
    for (const line of [total, isHome ? home : away]) {
      line.played++;
      line.goalsFor += gf;
      line.goalsAgainst += ga;
      if (ga === 0) line.cleanSheets++;
      if (gf > ga) line.won++;
      else if (gf < ga) line.lost++;
      else line.drawn++;
    }
  }
  if (total.played === 0) return null;
  return {
    seasonId: league.season,
    leagueId: toAppId(league.id),
    finished: false,
    total,
    home,
    away,
    scoredByMinute: MINUTE_BUCKETS.map(() => 0),
    concededByMinute: MINUTE_BUCKETS.map(() => 0),
  };
}

/**
 * Bağlama eklenen milli maç notları. Prompt kural 7 ile uyumlu: eksik veriden METİNDE söz edilmez, yalnız güven değerine yansır.
 */
export function buildNationalNotes(match: Match, afLeagueId: number, hasStandings: boolean): string[] {
  const notes = [
    'Bu bir milli takım maçıdır: kadrolar kulüp maçlarına göre daha az öngörülebilir, takımlar az maç birlikte oynar, son maçlar farklı rakip düzeylerindedir (hazırlık, eleme, turnuva).',
    'Sakat/cezalı listesi, muhtemel ilk 11 ve hakem bilgisi bu analizde YOKTUR: oyuncu adı uydurma, bu eksiklerden metinde söz etme; belirsizliği yalnız confidence/riskLevel değerine yansıt.',
  ];
  if (afLeagueId === FRIENDLIES_AF_ID) {
    notes.push('Hazırlık maçı: sonuç baskısı düşük; rotasyon, deneme kadrosu ve çok oyuncu değişikliği olabilir, ev sahibi avantajı ve form daha az belirleyicidir.');
  } else if (hasStandings) {
    notes.push('Sıra ve turnuva özeti, bu turnuva/gruptaki oynanmış maçlardan hesaplanmıştır (az maç oynanmış olabilir).');
  }
  if (match.stage && KNOCKOUT_ROUND.test(match.stage)) notes.push('Eleme turu maçı: kazanan/tur atlama baskısı var, temkinli oyun ve uzatma ihtimali artar.');
  return notes;
}

type Deps = { get?: AfGet; historical?: boolean };

const analysisGet: AfGet = (path, params) => apiFootballGet(path, params, fetch, 'analysis');

/** Maç sonucunu / olaylarını / kadrosunu / hakemini maç öncesi kurgusuna çevirir (sızıntı yok). */
function asPreMatchFixture(f: AfFixture): AfFixture {
  return {
    ...f,
    fixture: { ...f.fixture, referee: null, status: { short: 'NS', long: 'Not Started', elapsed: null, extra: null } },
    goals: { home: null, away: null },
    score: {},
    events: [],
    lineups: [],
    statistics: [],
    players: [],
  };
}

/** Takım penceresi: maç yılı ve önceki yıl(lar)ın fikstürleri; yetersizse bir yıl daha. */
async function loadTeamWindow(get: AfGet, afTeamId: number, year: number, koMs: number, matchAfId: number): Promise<AfFixture[]> {
  const fetchYear = async (y: number) => (await get<AfFixture>('/fixtures', { team: afTeamId, season: y, timezone: 'UTC' })).response ?? [];
  const first = (await Promise.all([fetchYear(year), fetchYear(year - 1)])).flat();
  if (splitTeamFixtures(first, afTeamId, koMs, matchAfId).played.length >= MAX_RECENT) return first;
  return [...first, ...(await fetchYear(year - 2))];
}

/**
 * Milli maç analiz bağlamı. `fixture` verilirse maç isteği atlanır (geriye dönük test: seçim listesindeki kayıt).
 * Veri alınamayan parçalar (H2H, turnuva fikstürü) hatada düşer; takım penceresi hatası bağlamı geçersiz kılar (null).
 */
export async function buildNationalAnalysisContext(
  matchId: string,
  opts: Deps & { fixture?: AfFixture } = {},
): Promise<MatchAnalysisContext | ArchivedMatchContext | null> {
  const get = opts.get ?? analysisGet;
  const afId = toAfId(matchId);
  if (afId == null) return null;
  const fx = opts.fixture ?? (await get<AfFixture>('/fixtures', { id: afId, timezone: 'UTC' })).response?.[0];
  if (!fx) return null;
  const koMs = kickoffMs(fx);
  if (!Number.isFinite(koMs)) return null;

  const pre = opts.historical === true || ['NS', 'TBD'].includes(fx.fixture.status.short);
  // Maç öncesi: sonuç/olay/kadro/hakem sızmaz (geriye dönük) ya da zaten yoktur; maç sürüyor/bitmişse tam paket.
  const live = pre ? null : mapNationalFixture(fx);
  const match = live ? live.match : mapNationalMatch(asPreMatchFixture(fx));
  const homeApp = { id: match.home!.id as number, name: match.home!.name ?? '' };
  const awayApp = { id: match.away!.id as number, name: match.away!.name ?? '' };
  const year = new Date(koMs).getUTCFullYear();
  const league = { id: fx.league.id, name: match.competition?.name ?? fx.league.name, season: fx.league.season ?? year };
  const friendlies = fx.league.id === FRIENDLIES_AF_ID;
  const knockout = KNOCKOUT_ROUND.test(fx.league.round ?? '');

  const [homeFx, awayFx, h2hFx, leagueFx] = await Promise.all([
    loadTeamWindow(get, fx.teams.home.id, year, koMs, afId),
    loadTeamWindow(get, fx.teams.away.id, year, koMs, afId),
    get<AfFixture>('/fixtures/headtohead', { h2h: `${fx.teams.home.id}-${fx.teams.away.id}`, timezone: 'UTC' })
      .then((r) => r.response ?? [])
      .catch(() => [] as AfFixture[]),
    friendlies
      ? Promise.resolve(null)
      : get<AfFixture>('/fixtures', { league: fx.league.id, season: league.season, timezone: 'UTC' })
          .then((r) => r.response ?? [])
          .catch(() => null),
  ]);

  const standings = leagueFx && !knockout ? computeStandingsAsOf(leagueFx, koMs, league) : null;
  const teamCtx = (fxList: AfFixture[], afTeamId: number, app: { id: number; name: string }): { ctx: TeamContext; upcoming: Match[] } => {
    const { played, upcoming } = splitTeamFixtures(fxList, afTeamId, koMs, afId);
    const rows = recentRows(played, app.id);
    const rowOf = [...(standings?.table ?? []), ...(standings?.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []))].find(
      (r) => Number(r.team_id ?? r.team?.id) === app.id,
    );
    return {
      ctx: {
        teamId: app.id,
        teamName: app.name,
        recentMatches: rows,
        metrics: computeMetrics(rows),
        standingRow: rowOf ?? null,
        // `absences` bilerek yok (undefined): prompt "Eksikler" bölümünü hiç yazmaz — milli maçta veri kaynağı yok.
        leagueStats: leagueFx ? computeTeamSeasonStatsAsOf(leagueFx, afTeamId, koMs, league) : null,
        scorers: [],
      },
      upcoming: upcoming.map(mapNationalMatch),
    };
  };
  const home = teamCtx(homeFx, fx.teams.home.id, homeApp);
  const away = teamCtx(awayFx, fx.teams.away.id, awayApp);

  // Durum bölümü: tur bilgisi yalnız eleme turunda anlamlı (grup/lig maçında satır "League A - 5" gürültüsü olur).
  const situationMatch: Match = { ...match, ...(knockout ? {} : { stage: undefined, round: undefined }) };
  const situation = buildMatchSituation({
    match: situationMatch,
    homeId: homeApp.id,
    awayId: awayApp.id,
    homeRows: home.ctx.recentMatches,
    awayRows: away.ctx.recentMatches,
    standings: null, // grup tablosunda "lidere/küme hattına puan" anlamsız
    extras: { isDerby: null, homeUpcoming: home.upcoming, awayUpcoming: away.upcoming, firstLeg: null },
  });

  const lineups = live ? live.lineups : opts.historical ? null : mapNationalLineups(fx);
  return {
    archived: false,
    match,
    matchPhase: pre ? 'PRE' : match.status === 'FINISHED' ? 'POST' : match.status === 'HALF TIME BREAK' ? 'HT' : 'LIVE',
    events: live?.events ?? [],
    liveStats: live?.stats ?? null,
    lineups,
    standings,
    homeTeam: home.ctx,
    awayTeam: away.ctx,
    h2h: buildNationalH2H(h2hFx, koMs, homeApp, awayApp),
    referee: null,
    situation,
    oddsSignal: { pre: null, live: null, movement: null },
    notes: buildNationalNotes(match, fx.league.id, standings != null),
  };
}
