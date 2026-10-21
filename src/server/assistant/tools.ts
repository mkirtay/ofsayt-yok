/**
 * AI Asistan araçları (function calling) — docs/AI_ASISTAN_V2_PLAN.md §3, v2.0 + v2.1 (H2H, oyuncu, maç detayı).
 *
 * Hepsi SALT OKUNUR ve mevcut önbellekli servisleri kullanır (fetchSportmonksCached üzerinden). Kredi düşen ya da
 * analiz üreten hiçbir işlem araç değildir. Erişim kararı (kredi duvarı) burada, `ctx.viewer` (oturum) ile verilir;
 * model argümanla kullanıcı ya da "açık" durumu veremez. Argümanlar elle doğrulanır (id sayı, tarih ISO, lig izinli).
 * Her araç modele kırpılmış JSON (`data`), istemciye site içi linkler ve (varsa) sunucunun ürettiği kart döner.
 */
import rulesJson from '@/content/kural-kosesi.json';
import { ASSISTANT_HELP_TOPICS, assistantHelp, type AssistantHelpTopic } from '@/content/assistantHelp';
import { PLAN_SPORTMONKS_LEAGUE_IDS, SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';
import trLeagues from '../../../public/locales/tr/leagues.json';
import { ANALYSIS_UNLOCK_COST } from '@/lib/analysisUnlock';
import type { Match } from '@/models/liveScore';
import {
  getAllLiveMatches,
  getCompetitionTableFull,
  getTeamsHead2Head,
  getTopScorers,
  lookupSportmonksFixture,
  type CompetitionTableStandingRow,
} from '@/services/liveScoreService';
import { getTeamOverview } from '@/services/teamPage';
import { getPlayerProfile } from '@/services/playerProfile';
import { STAT, statMain } from '@/services/sportmonks/playerStatTypes';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { summarizeH2H } from '@/utils/compareData';
import { teamForm } from '@/services/sportmonks/teamOverview';
import { loadHomeDay, loadUpcomingMatchDays } from '@/server/homeDay';
import { shiftIsoDate } from '@/utils/dateStrip';
import { getTeamAbsences } from '@/server/analysisTeamAbsences';
import type { AnalysisViewer } from '@/server/analysisAccess';
import { matchKickoffMs } from '@/utils/matchActivity';
import { buildMatchHref } from '@/utils/matchUrl';
import { normalizeSearchText } from '@/utils/searchText';
import { analysisCardForTeams, pickFixtures, resolveTeam, type AssistantAnalysisCard } from './matchAnalysisRequest';
import { RULES_PANEL_HREF, type AssistantLink } from './outputFilter';

export type ToolContext = { viewer: AnalysisViewer | null; locale: 'tr' | 'en'; todayIso: string };

export type AssistantMatchItem = { id: number; home: string; away: string; league?: string; kickoffMs: number | null; status: string; score?: string; minute?: string; tv?: string[]; href: string };

export type AssistantStandingRow = { rank: number; team: string; played: number; points: number };
export type AssistantCard =
  | { type: 'analysis'; card: AssistantAnalysisCard }
  | { type: 'matches'; matches: AssistantMatchItem[] }
  /** İlk 8 satır + "Tüm puan durumu" linki (kartın kendi linki; ayrıca link gönderilmez). */
  | { type: 'standings'; league: string; rows: AssistantStandingRow[]; href: string };

/** `reply`: verilirse yanıt metni modelden değil buradan gelir (sohbet döngüsü modele dönmeden bitirir) — kartla birebir tutarlı sabit mesajlar için. */
export type ToolResult = { data: unknown; links?: AssistantLink[]; card?: AssistantCard; reply?: string };

export class ToolArgumentError extends Error {}

/**
 * Modelin lig adını id'ye çevirebilmesi için (sistem prompt'una girer). Sitenin lig tablosundan türetilir (planın 34 ligi,
 * lig sekmeleriyle aynı Türkçe kısa adlar) — elle tutulan ikinci liste yok.
 */
const LEAGUE_SHORT_NAMES = (trLeagues as { short: Record<string, string> }).short;
export const ASSISTANT_LEAGUES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(SPORTMONKS_LEAGUE_NAME_KEYS).map(([id, key]) => [Number(id), LEAGUE_SHORT_NAMES[key] ?? key]),
);

/** "Türkiye / Türk maçları": takip edilen bütün Türk ligleri ve kupası (Süper Lig, 1. Lig, Türkiye Kupası, 2. Lig). */
export const TURKEY_LEAGUE_IDS: readonly number[] = [600, 603, 606, 1282, 1283];
/** "En yakın X maçı": bugünden sonra en çok bu kadar gün ileri bakılır (lig takvimi önbellekli). */
export const FIXTURES_LOOKAHEAD_DAYS = 7;

const TZ = 'Europe/Istanbul';
const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function intArg(v: unknown, name: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n <= 0) throw new ToolArgumentError(`${name} geçersiz`);
  return n;
}
function leagueArg(v: unknown): number {
  const id = intArg(v, 'league_id');
  if (!PLAN_SPORTMONKS_LEAGUE_IDS.includes(id)) throw new ToolArgumentError('league_id kapsam dışı');
  return id;
}
function strArg(v: unknown, name: string, max = 60): string {
  if (typeof v !== 'string' || !v.trim()) throw new ToolArgumentError(`${name} boş`);
  return v.trim().slice(0, max);
}

function matchItem(m: Match): AssistantMatchItem {
  const ko = (m as Match & { kickoff_ts?: number }).kickoff_ts ?? matchKickoffMs(m);
  const live = m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK';
  const score = m.scores?.score && m.status !== 'NOT STARTED' ? m.scores.score : undefined;
  return {
    id: Number(m.id),
    home: m.home?.name ?? '',
    away: m.away?.name ?? '',
    ...(m.competition?.name ? { league: m.competition.name } : {}),
    kickoffMs: ko ?? null,
    status: m.status,
    ...(score ? { score } : {}),
    ...(live && m.time ? { minute: String(m.time) } : {}),
    ...(m.tv_stations?.length ? { tv: m.tv_stations.slice(0, 4) } : {}),
    href: buildMatchHref(m),
  };
}

/** Modele giden kısa maç satırı (saat Türkiye saati). */
function forModel(i: AssistantMatchItem) {
  return {
    match_id: i.id,
    home: i.home,
    away: i.away,
    league: i.league,
    date: i.kickoffMs != null ? fmtDate.format(new Date(i.kickoffMs)) : undefined,
    time_tr: i.kickoffMs != null ? fmtTime.format(new Date(i.kickoffMs)) : undefined,
    status: i.status,
    score: i.score,
    minute: i.minute,
    tv: i.tv,
  };
}

const matchLinks = (items: AssistantMatchItem[], max = 2): AssistantLink[] => items.slice(0, max).map((i) => ({ label: `${i.home} – ${i.away}`, href: i.href }));

// ─── Yürütücüler ─────────────────────────────────────────────────────────────

async function findTeam(args: Record<string, unknown>): Promise<ToolResult> {
  const teams = (await resolveTeam(strArg(args.query, 'query'))).slice(0, 3);
  return {
    // Link yok: takım bulma ara adımdır (takım çipi yanıtı kalabalıklaştırıyordu); takım linkini get_team_overview verir.
    data: teams.length ? { teams: teams.map((t) => ({ team_id: t.id, name: t.name })) } : { teams: [], note: 'not_found' },
  };
}

async function getFixtures(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (args.team_id != null) {
    const teamId = intArg(args.team_id, 'team_id');
    const overview = await getTeamOverview(String(teamId));
    const upcoming = overview.fixtures.slice(0, 3).map(matchItem);
    const recent = overview.recent.slice(0, 3).map(matchItem);
    // TV kanalı yalnız maç detayında (maç sayfasıyla AYNI önbellekli `fixtures/{id}` isteği; yeni istek türü yok):
    // sıradaki 2 maç için. Kanal yoksa `tv_note` → model "Kanal bilgisi henüz yok" der (uydurmaz).
    await Promise.all(
      upcoming.slice(0, 2).map(async (item, i) => {
        try {
          const detail = await lookupSportmonksFixture(String(item.id));
          if (detail.kind === 'found' && detail.match.tv_stations?.length) upcoming[i] = { ...item, tv: detail.match.tv_stations.slice(0, 4) };
        } catch {
          // kanal bilgisi alınamadı: satır kanalsız
        }
      }),
    );
    return {
      data: {
        team: overview.team?.name,
        upcoming: upcoming.map((u, i) => ({ ...forModel(u), ...(i < 2 && !u.tv ? { tv_note: 'not_announced' } : {}) })),
        recent: recent.map(forModel),
      },
      links: [...matchLinks(upcoming, 1), { label: overview.team?.name ?? 'Takım', href: `/teams/${teamId}` }],
      card: upcoming.length || recent.length ? { type: 'matches', matches: [...upcoming.slice(0, 2), ...recent.slice(0, 2)] } : undefined,
    };
  }
  const date = args.date == null ? ctx.todayIso : strArg(args.date, 'date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new ToolArgumentError('date YYYY-AA-GG olmalı');
  // Lig süzgeci: tek lig ya da "turkey" kapsamı (bütün Türk ligleri). Yoksa günün tüm maçları.
  const leagueIds: number[] | null = args.scope === 'turkey' ? [...TURKEY_LEAGUE_IDS] : args.league_id == null ? null : [leagueArg(args.league_id)];
  const inScope = (m: Match) => leagueIds == null || leagueIds.includes(Number(m.competition?.id ?? m.competition_id));
  const rank = (m: Match) => (TURKEY_LEAGUE_IDS.includes(Number(m.competition?.id ?? m.competition_id)) ? 0 : 1);
  const listFor = async (day: string) =>
    (await loadHomeDay(day)).fixtureMatches.filter(inScope).sort((a, b) => rank(a) - rank(b) || (matchKickoffMs(a) ?? 0) - (matchKickoffMs(b) ?? 0)).map(matchItem);
  const scopeLabel = args.scope === 'turkey' ? (ctx.locale === 'tr' ? 'Türkiye' : 'Turkey') : leagueIds ? (ASSISTANT_LEAGUES[leagueIds[0]!] ?? String(leagueIds[0])) : null;
  const allLink: AssistantLink = { label: ctx.locale === 'tr' ? 'Tüm maçlar' : 'All matches', href: '/' };

  let items = await listFor(date);
  let listedDate = date;
  let note: string | undefined;
  // Lig/kapsam verildi ve o gün maç yok (ya da "en yakın" istendi): önümüzdeki 7 güne bak (lig takvimi önbellekli).
  if (leagueIds && (items.length === 0 || args.upcoming === true) && date === ctx.todayIso) {
    const limit = shiftIsoDate(ctx.todayIso, FIXTURES_LOOKAHEAD_DAYS);
    const days = (await loadUpcomingMatchDays(ctx.todayIso, leagueIds)).map((d) => d.date).sort();
    const nextDay = days.find((d) => d > ctx.todayIso);
    if (items.length === 0) {
      if (nextDay && nextDay <= limit) {
        items = await listFor(nextDay);
        listedDate = nextDay;
        note = 'no_match_today_next_day_listed';
      } else {
        const days7 = ctx.locale === 'tr' ? `Önümüzdeki ${FIXTURES_LOOKAHEAD_DAYS} günde ${scopeLabel} maçı yok.` : `No ${scopeLabel} matches in the next ${FIXTURES_LOOKAHEAD_DAYS} days.`;
        return {
          data: { date, scope: scopeLabel, matches: [], note: 'none_in_lookahead', lookahead_days: FIXTURES_LOOKAHEAD_DAYS, ...(nextDay ? { next_match_day: nextDay } : {}), message_for_user: days7 },
          reply: nextDay ? `${days7} ${ctx.locale === 'tr' ? `İlk maç günü: ${nextDay}.` : `Next match day: ${nextDay}.`}` : days7,
          links: [allLink],
        };
      }
    } else if (nextDay && nextDay <= limit && args.upcoming === true) {
      note = 'today_listed_more_days_ahead';
    }
  }
  return {
    data: { date: listedDate, requested_date: date, scope: scopeLabel, total: items.length, matches: items.slice(0, 15).map(forModel), ...(note ? { note } : {}) },
    links: [allLink, ...matchLinks(items, 2)],
    card: items.length ? { type: 'matches', matches: items.slice(0, 5) } : undefined,
  };
}

async function getLiveScores(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const items = (await getAllLiveMatches()).map(matchItem);
  return {
    data: { total: items.length, matches: items.slice(0, 15).map(forModel) },
    links: [{ label: ctx.locale === 'tr' ? 'Canlı maçlar' : 'Live matches', href: '/?tab=live' }],
    card: items.length ? { type: 'matches', matches: items.slice(0, 5) } : undefined,
  };
}

function standingRows(table: Awaited<ReturnType<typeof getCompetitionTableFull>>): CompetitionTableStandingRow[] {
  if (!table) return [];
  if (table.table?.length) return table.table;
  return (table.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []));
}

async function getStandings(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const leagueId = leagueArg(args.league_id);
  const rows = standingRows(await getCompetitionTableFull(String(leagueId)));
  const league = ASSISTANT_LEAGUES[leagueId] ?? String(leagueId);
  const compact = rows.slice(0, 8).map((r) => ({ rank: r.rank, team: r.team?.name ?? r.name ?? '', played: r.matches, points: r.points }));
  return {
    data: {
      league,
      rows: rows.slice(0, 24).map((r) => ({ rank: r.rank, team: r.team?.name ?? r.name, played: r.matches, won: r.won, drawn: r.drawn, lost: r.lost, gd: r.goal_diff, points: r.points })),
      note: 'Arayüz ilk 8 takımı tablo kartı olarak gösterir; en fazla tek cümle yaz.',
    },
    ...(compact.length ? { card: { type: 'standings', league, rows: compact, href: '/standings' } } : {}),
    links: [{ label: ctx.locale === 'tr' ? 'Puan durumu' : 'Standings', href: '/standings' }],
  };
}

async function getTopScorersTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const leagueId = leagueArg(args.league_id);
  const type = args.type === 'assists' ? 'assists' : 'goals';
  const list = (await getTopScorers(String(leagueId)))?.topscorers ?? [];
  const sorted = type === 'assists' ? [...list].filter((e) => (e.assists ?? 0) > 0).sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0)) : [...list].filter((e) => e.goals > 0).sort((a, b) => b.goals - a.goals);
  return {
    data: {
      league: ASSISTANT_LEAGUES[leagueId],
      type,
      players: sorted.slice(0, 10).map((e, i) => ({ rank: i + 1, player: e.player?.name?.trim(), team: e.team?.name, goals: e.goals, assists: e.assists ?? 0, played: e.played })),
    },
    links: [{ label: ctx.locale === 'tr' ? 'Puan durumu ve krallık' : 'Standings and top scorers', href: '/standings' }],
  };
}

async function getTeamOverviewTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const teamId = intArg(args.team_id, 'team_id');
  const [overview, extra] = await Promise.all([getTeamOverview(String(teamId)), getTeamAbsences(teamId, ctx.todayIso)]);
  if (!overview.team) return { data: { note: 'not_found' } };
  const form = teamForm(overview.recent, String(teamId), 5).map((f) => f.result);
  const next = overview.fixtures[0] ? matchItem(overview.fixtures[0]) : null;
  const ls = extra?.leagueStats;
  const line = (l: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number }) => ({ played: l.played, won: l.won, drawn: l.drawn, lost: l.lost, goals_for: l.goalsFor, goals_against: l.goalsAgainst });
  return {
    data: {
      team: overview.team.name,
      coach: overview.coach?.name,
      form_last5_newest_first: form,
      next_match: next ? forModel(next) : null,
      league_season: ls ? { total: line(ls.total), home: line(ls.home), away: line(ls.away), clean_sheets: ls.total.cleanSheets } : undefined,
      top_contributors: extra?.scorers.slice(0, 4),
      // `null`: veri alınamadı (bilinmiyor); `[]`: bilinen eksik yok.
      sidelined: extra ? extra.players.slice(0, 8).map((p) => ({ name: p.name, position: p.position, kind: p.kind, reason: p.reason, until: p.until })) : null,
    },
    links: [{ label: overview.team.name, href: `/teams/${teamId}` }, ...(next ? matchLinks([next], 1) : [])],
  };
}

async function getMatchAnalysis(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const card = await analysisCardForTeams(ctx.viewer, strArg(args.home_team, 'home_team'), strArg(args.away_team, 'away_team'));
  // Modele giden veri karttan türetilir: kilitliyken kartta yalnız önizleme olduğu için model de yalnız onu görür.
  switch (card.kind) {
    case 'locked':
      return {
        data: { status: 'locked', match: `${card.match.home} – ${card.match.away}`, free_preview: { most_likely: card.preview.top, summary: card.preview.summary }, unlock_cost_credits: card.cost, note: 'Tam analiz kilitli; kullanıcı karttaki düğmeyle açabilir.' },
        card: { type: 'analysis', card },
        links: [{ label: `${card.match.home} – ${card.match.away}`, href: card.match.href }],
      };
    case 'summary':
      return {
        data: { status: 'open', match: `${card.match.home} – ${card.match.away}`, most_likely: card.top, points: card.points },
        card: { type: 'analysis', card },
        links: [{ label: ctx.locale === 'tr' ? 'AI Analiz sekmesi' : 'AI Analysis tab', href: card.match.href }],
      };
    case 'none': {
      // Sabit mesaj (kartla aynı cümle): model durumları karıştırmasın. Asistan üretmez; yalnız yönlendirir.
      const tr = ctx.locale === 'tr';
      const reply =
        card.reason === 'scheduled'
          ? tr
            ? 'Bu maçın analizi henüz hazır değil. Analiz maçtan yaklaşık 3 saat önce hazırlanır.'
            : "This match's analysis isn't ready yet. Analyses are prepared about 3 hours before kick-off."
          : card.reason === 'self-serve'
            ? tr
              ? `Bu maç için hazır analiz yok. Maç sayfasından ${ANALYSIS_UNLOCK_COST} krediyle kendin üretebilirsin.`
              : `There's no ready analysis for this match. You can generate one yourself on the match page for ${ANALYSIS_UNLOCK_COST} credit.`
            : tr
              ? 'Bu maç için analiz hazırlanmıyor.'
              : 'No analysis is prepared for this match.';
      const status = card.reason === 'scheduled' ? 'not_ready' : card.reason === 'self-serve' ? 'self_serve' : 'not_planned';
      return {
        data: { status, match: `${card.match.home} – ${card.match.away}`, message_for_user: reply },
        reply,
        card: { type: 'analysis', card },
        links: [{ label: `${card.match.home} – ${card.match.away}`, href: card.match.href }],
      };
    }
    case 'choose':
      return { data: { status: 'ambiguous', options: card.options.map((o) => ({ match_id: o.id, home: o.home, away: o.away })) }, card: { type: 'analysis', card } };
    default:
      return { data: { status: card.kind } };
  }
}

/** Takım argümanı: team_id (sayı) ya da ad/takma ad (find_team ile aynı çözüm) — ayrı find_team turu gerekmesin. */
async function teamRef(v: unknown, name: string): Promise<{ id: number; name?: string } | null> {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{1,12}$/.test(v.trim()))) return { id: intArg(typeof v === 'string' ? v.trim() : v, name) };
  const hit = (await resolveTeam(strArg(v, name)))[0];
  return hit ? { id: hit.id, name: hit.name } : null;
}

const H2H_LIMIT = 5;

async function getHeadToHead(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const [a, b] = await Promise.all([teamRef(args.team_a, 'team_a'), teamRef(args.team_b, 'team_b')]);
  if (!a || !b) return { data: { note: 'team_not_found', missing: a ? 'team_b' : 'team_a' } };
  if (a.id === b.id) throw new ToolArgumentError('aynı takım');
  // Maç kartı ve karşılaştırma sayfasıyla AYNI önbellekli istek (fixtures/head-to-head + iki takım formu).
  const raw = await getTeamsHead2Head(String(a.id), String(b.id));
  const nameA = raw?.team1.name ?? a.name ?? String(a.id);
  const nameB = raw?.team2.name ?? b.name ?? String(b.id);
  const sum = summarizeH2H(raw?.h2h, nameA, nameB, H2H_LIMIT);
  const goals = sum.rows.reduce(
    (g, r) => {
      const [hg, ag] = r.score.split('-').map(Number) as [number, number];
      return { a: g.a + (r.team1IsHome ? hg : ag), b: g.b + (r.team1IsHome ? ag : hg) };
    },
    { a: 0, b: 0 },
  );
  const href = `/compare/${a.id}-vs-${b.id}`;
  return {
    data: {
      team_a: nameA,
      team_b: nameB,
      last_meetings: sum.total,
      ...(sum.total
        ? { team_a_wins: sum.team1Wins, draws: sum.draws, team_b_wins: sum.team2Wins, goals_team_a: goals.a, goals_team_b: goals.b, matches_newest_first: sum.rows.map((r) => ({ date: r.date, home: r.homeName, away: r.awayName, score: r.score })) }
        : { note: 'no_meetings_in_data' }),
    },
    links: [{ label: ctx.locale === 'tr' ? `${nameA} – ${nameB} karşılaştırma` : `${nameA} vs ${nameB}`, href }],
  };
}

/** Oyuncu adlarında sonda NBSP / boşluk gelebiliyor (Sportmonks). */
const cleanName = (s: string | undefined | null) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

type PlayerSearchRow = { id: number; display_name?: string; common_name?: string; name?: string };

async function searchPlayers(query: string): Promise<PlayerSearchRow[]> {
  const q = query.slice(0, 40);
  if (q.length < 3) throw new ToolArgumentError('query en az 3 harf');
  // Tek istek (`players/search/{q}`, sunucu önbelleği 6 sa); ek include yok.
  const env = await sportmonksClientRequest<PlayerSearchRow[]>('football', `/players/search/${encodeURIComponent(q)}`, {});
  const rows = env.data ?? [];
  // Tam ad eşleşmesi (ör. "Icardi" → common_name) öne; gerisi Sportmonks sırası.
  const nq = normalizeSearchText(q);
  const exact = (r: PlayerSearchRow) => [r.display_name, r.common_name, r.name].some((n) => n && normalizeSearchText(cleanName(n)) === nq);
  return [...rows.filter(exact), ...rows.filter((r) => !exact(r))];
}

async function getPlayer(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  let playerId: number;
  let others: Array<{ player_id: number; name: string }> = [];
  if (args.player_id != null) playerId = intArg(args.player_id, 'player_id');
  else {
    const hits = await searchPlayers(strArg(args.query, 'query'));
    if (!hits.length) return { data: { players: [], note: 'not_found' } };
    playerId = hits[0]!.id;
    others = hits.slice(1, 4).map((r) => ({ player_id: r.id, name: cleanName(r.display_name ?? r.common_name ?? r.name) }));
  }
  // Oyuncu sayfasıyla AYNI önbellekli istek (`players/{id}` + istatistik). `has_values:false` / detaysız sahte sezon
  // satırları mapper'da elenir (oyuncu sayfası Kariyer kartıyla aynı kural).
  const p = await getPlayerProfile(playerId);
  if (!p) return { data: { note: 'not_found' } };
  const season = p.seasons[0]?.seasonName;
  const rows = p.seasons
    .filter((r) => r.seasonName === season && statMain(r.stats[STAT.APPEARANCES]) != null)
    .map((r) => ({
      competition: r.leagueName,
      team: r.teamName,
      apps: statMain(r.stats[STAT.APPEARANCES]),
      // Sportmonks sıfır değerli tipi yanıttan atıyor → yoksa 0. Gol = total (penaltı dahil).
      goals: statMain(r.stats[STAT.GOALS]) ?? 0,
      assists: statMain(r.stats[STAT.ASSISTS]) ?? 0,
    }));
  const name = cleanName(p.name);
  return {
    data: {
      player_id: p.id,
      name,
      team: p.currentTeam?.name,
      position: p.detailedPosition ?? p.position,
      nationality: p.nationality?.name,
      date_of_birth: p.dateOfBirth,
      ...(season ? { season, season_stats: rows } : { season_stats: [] }),
      coverage_note: 'Yalnız bu sezon. Kariyer / tüm zamanlar toplamı yok (yerel ligler 2024/25 sezonundan itibaren); bu tür sayı yazma.',
      ...(others.length ? { other_matches: others } : {}),
    },
    links: [{ label: name || (ctx.locale === 'tr' ? 'Oyuncu' : 'Player'), href: `/players/${p.id}` }],
  };
}

/** `"H:A"` istatistik değeri → [ev, deplasman]; yoksa undefined. */
function pair(v: string | null | undefined): [number, number] | undefined {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

const GOAL_EVENTS: Readonly<Record<string, string | undefined>> = { GOAL: undefined, PENALTY: 'penalty', OWN_GOAL: 'own_goal' };

async function getMatchDetail(args: Record<string, unknown>): Promise<ToolResult> {
  let matchId: number;
  if (args.match_id != null) matchId = intArg(args.match_id, 'match_id');
  else {
    const date = args.date == null ? null : strArg(args.date, 'date', 10);
    if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolArgumentError('date YYYY-AA-GG olmalı');
    const [home, away] = await Promise.all([resolveTeam(strArg(args.home_team, 'home_team')), resolveTeam(strArg(args.away_team, 'away_team'))]);
    if (!home.length || !away.length) return { data: { note: 'team_not_found' } };
    // Takım sayfasıyla aynı önbellekli istek; son maçlar önce (oynanmış/canlı maç aranıyor), sonra fikstür.
    const overview = await getTeamOverview(String(home[0]!.id));
    const awayIds = new Set(away.map((t) => t.id));
    const candidates = [
      ...pickFixtures({ recent: overview.recent, fixtures: [] }, awayIds),
      ...pickFixtures({ recent: [], fixtures: overview.fixtures }, awayIds),
    ].filter((c) => date == null || (c.kickoffMs != null && fmtDate.format(new Date(c.kickoffMs)) === date));
    if (!candidates.length) return { data: { note: 'match_not_found_in_recent_or_upcoming', hint: 'get_head_to_head older meetings' } };
    matchId = candidates[0]!.id;
  }
  // Maç sayfasıyla AYNI önbellekli istek (`fixtures/{id}`); yeni istek türü yok.
  const lookup = await lookupSportmonksFixture(String(matchId));
  if (lookup.kind === 'missing') return { data: { note: 'not_found' } };
  if (lookup.kind !== 'found') throw new Error('fixture unavailable');
  const { match, events, stats } = lookup;
  const item = matchItem(match);
  const base = { ...forModel(item), ht_score: match.scores?.ht_score, finish: match.finish };
  const links = matchLinks([item], 1);
  const card: AssistantCard = { type: 'matches', matches: [item] };
  if (match.status === 'NOT STARTED') return { data: { ...base, note: 'not_started' }, links, card };

  const side = (e: { is_home: boolean; is_away: boolean }) => (e.is_home ? 'home' : e.is_away ? 'away' : undefined);
  const goals = events
    .filter((e) => e.event in GOAL_EVENTS)
    .sort((x, y) => x.sort - y.sort)
    .map((e) => ({ minute: e.time, player: cleanName(e.player.name) || undefined, team: side(e), type: GOAL_EVENTS[e.event] }));
  // Kart SAYILARI istatistikten (olaylar teknik direktör kartlarını da içeriyor); istatistik yoksa (hafif yedek) maçın
  // kırmızı kart sayacı (teknik direktör ve VAR iptali hariç). İsim listesi yalnız oyuncu olaylarından (player_id > 0).
  const red = pair(stats?.red_cards) ?? (match.red_cards ? [match.red_cards.home, match.red_cards.away] : undefined);
  const redPlayers = events
    .filter((e) => (e.event === 'RED_CARD' || e.event === 'YELLOW_RED_CARD') && e.player.id > 0)
    .map((e) => ({ minute: e.time, player: cleanName(e.player.name), team: side(e), second_yellow: e.event === 'YELLOW_RED_CARD' || undefined }));
  const s = {
    possession_pct: pair(stats?.possesion),
    shots: pair(stats?.attempts_on_goal),
    shots_on_target: pair(stats?.shots_on_target),
    corners: pair(stats?.corners),
    fouls: pair(stats?.fauls),
    offsides: pair(stats?.offsides),
    saves: pair(stats?.saves),
    yellow_cards: pair(stats?.yellow_cards),
    red_cards: red,
  };
  return {
    data: {
      ...base,
      goals,
      red_card_players: redPlayers,
      stats_home_away: s,
      note: `Skor esastır; gol listesi olaylardan.${stats ? '' : ' İstatistik şu an alınamadı.'}`,
    },
    links,
    card,
  };
}

type RuleRow = { id: string; baslik: string; metin: string; biliyorMuydun?: string | null; en?: { baslik?: string; metin?: string; biliyorMuydun?: string | null } };
const RULES = rulesJson as RuleRow[];

function getRules(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const all = RULES.map((r) => (ctx.locale === 'en' && r.en?.baslik && r.en.metin ? { id: r.id, title: r.en.baslik, text: r.en.metin, note: r.en.biliyorMuydun ?? undefined } : { id: r.id, title: r.baslik, text: r.metin, note: r.biliyorMuydun ?? undefined }));
  const q = typeof args.topic === 'string' ? normalizeSearchText(args.topic).split(/\s+/).filter((w) => w.length > 2) : [];
  const hits = q.length ? all.filter((r) => q.some((w) => normalizeSearchText(`${r.id} ${r.title} ${r.text}`).includes(w))) : [];
  return {
    data: hits.length ? { rules: hits.slice(0, 3) } : { rules: [], available_topics: all.map((r) => r.title), note: q.length ? 'no_match' : 'topic_required' },
    links: [{ label: ctx.locale === 'tr' ? "Kural Köşesi'nde aç" : 'Open in Rules Corner', href: RULES_PANEL_HREF }],
  };
}

function getSiteHelp(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const topic = (ASSISTANT_HELP_TOPICS as readonly string[]).includes(String(args.topic)) ? (args.topic as AssistantHelpTopic) : 'assistant';
  const entry = assistantHelp(topic, ctx.locale);
  return { data: { topic, facts: entry.facts }, links: entry.links };
}

// ─── Tanımlar ────────────────────────────────────────────────────────────────

type ToolDef = { description: string; parameters: Record<string, unknown>; run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult> | ToolResult };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const LEAGUE_ID = { type: 'integer', description: 'Lig id (sistem mesajındaki listeden)' };

export const ASSISTANT_TOOLS: Readonly<Record<string, ToolDef>> = {
  find_team: { description: 'Takım adını/takma adını (GS, Cimbom, Fener) takım id\'sine çevirir.', parameters: obj({ query: { type: 'string' } }, ['query']), run: findTeam },
  get_fixtures: {
    description:
      'Maçlar: bir günün maçları (date; isteğe bağlı league_id ya da scope=turkey: bütün Türk ligleri/kupası) ya da bir takımın sıradaki ve son maçları (team_id). Lig/kapsam verildiğinde o gün maç yoksa önümüzdeki 7 güne bakar; upcoming=true "en yakın maç" için. Saat, skor; TV kanalı YALNIZ team_id ile (sıradaki 2 maç).',
    parameters: obj({
      date: { type: 'string', description: 'YYYY-AA-GG (Türkiye günü); boşsa bugün' },
      team_id: { type: 'integer' },
      league_id: LEAGUE_ID,
      scope: { type: 'string', enum: ['turkey'], description: 'Türkiye / Türk maçları: bütün takip edilen Türk ligleri' },
      upcoming: { type: 'boolean', description: 'En yakın maç(lar): bugünden itibaren 7 gün ileri' },
    }),
    run: getFixtures,
  },
  get_live_scores: { description: 'Şu an oynanan maçlar: skor ve dakika.', parameters: obj({}), run: getLiveScores },
  get_standings: { description: 'Lig puan durumu.', parameters: obj({ league_id: LEAGUE_ID }, ['league_id']), run: getStandings },
  get_top_scorers: { description: 'Lig gol ya da asist krallığı (ilk 10).', parameters: obj({ league_id: LEAGUE_ID, type: { type: 'string', enum: ['goals', 'assists'] } }, ['league_id']), run: getTopScorersTool },
  get_team_overview: { description: 'Takım: son 5 maç formu, sıradaki maç, ligde sezon özeti (ev/deplasman), gol katkısı yapanlar, sakat ve cezalılar, teknik direktör.', parameters: obj({ team_id: { type: 'integer' } }, ['team_id']), run: getTeamOverviewTool },
  get_match_analysis: {
    description: 'İki takımın maçı için HAZIR AI analizi. Kilitliyse yalnız ücretsiz önizleme döner. Yeni analiz üretmez.',
    parameters: obj({ home_team: { type: 'string' }, away_team: { type: 'string' } }, ['home_team', 'away_team']),
    run: getMatchAnalysis,
  },
  get_head_to_head: {
    description: 'İki takımın son karşılaşmaları (en çok 5): G/B/M, goller, skorlar.',
    parameters: obj({ team_a: { type: 'string', description: 'Takım adı ya da team_id' }, team_b: { type: 'string', description: 'Takım adı ya da team_id' } }, ['team_a', 'team_b']),
    run: getHeadToHead,
  },
  get_player: {
    description: 'Oyuncu: kulüp, mevki, BU SEZON maç/gol/asist (kariyer toplamı yok).',
    parameters: obj({ query: { type: 'string', description: 'Oyuncu adı' }, player_id: { type: 'integer' } }),
    run: getPlayer,
  },
  get_match_detail: {
    description: 'Oynanmış/canlı maç: skor, goller (dakika, oyuncu), kırmızı kartlar, temel istatistik. match_id ya da home_team+away_team (+date).',
    parameters: obj({ match_id: { type: 'integer' }, home_team: { type: 'string' }, away_team: { type: 'string' }, date: { type: 'string', description: 'YYYY-AA-GG' } }),
    run: getMatchDetail,
  },
  get_rules: { description: 'Futbol kuralları (Kural Köşesi metinleri). topic: aranan konu (ör. ofsayt, VAR, uzatma).', parameters: obj({ topic: { type: 'string' } }, ['topic']), run: getRules },
  get_site_help: { description: 'Site yardımı: kredi, analiz açma, hesap, asistan.', parameters: obj({ topic: { type: 'string', enum: [...ASSISTANT_HELP_TOPICS] } }, ['topic']), run: getSiteHelp },
};

/** OpenAI `tools` parametresi. */
export function openAiToolDefinitions() {
  return Object.entries(ASSISTANT_TOOLS).map(([name, t]) => ({ type: 'function' as const, function: { name, description: t.description, parameters: t.parameters } }));
}

const MAX_TOOL_OUTPUT_CHARS = 6000;

/** Aracı çalıştırır; bilinmeyen araç / geçersiz argüman / hata modele kısa hata verisi olarak döner (fırlatmaz). */
export async function runAssistantTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult & { ok: boolean }> {
  const tool = ASSISTANT_TOOLS[name];
  if (!tool) return { ok: false, data: { error: 'unknown_tool' } };
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = rawArgs ? JSON.parse(rawArgs) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('nesne değil');
    args = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, data: { error: 'invalid_arguments' } };
  }
  try {
    const result = await tool.run(args, ctx);
    const json = JSON.stringify(result.data);
    if (json.length > MAX_TOOL_OUTPUT_CHARS) return { ok: true, ...result, data: { truncated: true, text: json.slice(0, MAX_TOOL_OUTPUT_CHARS) } };
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof ToolArgumentError) return { ok: false, data: { error: 'invalid_arguments', detail: e.message } };
    return { ok: false, data: { error: 'data_unavailable' } };
  }
}
