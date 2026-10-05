/**
 * AI Asistan araçları (function calling) — docs/AI_ASISTAN_V2_PLAN.md §3, v2.0 kapsamı.
 *
 * Hepsi SALT OKUNUR ve mevcut önbellekli servisleri kullanır (fetchSportmonksCached üzerinden). Kredi düşen ya da
 * analiz üreten hiçbir işlem araç değildir. Erişim kararı (kredi duvarı) burada, `ctx.viewer` (oturum) ile verilir;
 * model argümanla kullanıcı ya da "açık" durumu veremez. Argümanlar elle doğrulanır (id sayı, tarih ISO, lig izinli).
 * Her araç modele kırpılmış JSON (`data`), istemciye site içi linkler ve (varsa) sunucunun ürettiği kart döner.
 */
import rulesJson from '@/content/kural-kosesi.json';
import { ASSISTANT_HELP_TOPICS, assistantHelp, type AssistantHelpTopic } from '@/content/assistantHelp';
import { PLAN_SPORTMONKS_LEAGUE_IDS } from '@/config/leagueNameKeys';
import { ANALYSIS_UNLOCK_COST } from '@/lib/analysisUnlock';
import type { Match } from '@/models/liveScore';
import {
  getAllLiveMatches,
  getCompetitionTableFull,
  getTopScorers,
  lookupSportmonksFixture,
  type CompetitionTableStandingRow,
} from '@/services/liveScoreService';
import { getTeamOverview } from '@/services/teamPage';
import { teamForm } from '@/services/sportmonks/teamOverview';
import { loadHomeDay } from '@/server/homeDay';
import { getTeamAbsences } from '@/server/analysisTeamAbsences';
import type { AnalysisViewer } from '@/server/analysisAccess';
import { matchKickoffMs } from '@/utils/matchActivity';
import { buildMatchHref } from '@/utils/matchUrl';
import { normalizeSearchText } from '@/utils/searchText';
import { analysisCardForTeams, resolveTeam, type AssistantAnalysisCard } from './matchAnalysisRequest';
import { RULES_PANEL_HREF, type AssistantLink } from './outputFilter';

export type ToolContext = { viewer: AnalysisViewer | null; locale: 'tr' | 'en'; todayIso: string };

export type AssistantMatchItem = { id: number; home: string; away: string; league?: string; kickoffMs: number | null; status: string; score?: string; minute?: string; tv?: string[]; href: string };

export type AssistantCard = { type: 'analysis'; card: AssistantAnalysisCard } | { type: 'matches'; matches: AssistantMatchItem[] };

/** `reply`: verilirse yanıt metni modelden değil buradan gelir (sohbet döngüsü modele dönmeden bitirir) — kartla birebir tutarlı sabit mesajlar için. */
export type ToolResult = { data: unknown; links?: AssistantLink[]; card?: AssistantCard; reply?: string };

export class ToolArgumentError extends Error {}

/** Modelin lig adını id'ye çevirebilmesi için (sistem prompt'una girer). */
export const ASSISTANT_LEAGUES: Readonly<Record<number, string>> = {
  600: 'Süper Lig', 603: '1. Lig', 606: 'Türkiye Kupası', 2: 'Şampiyonlar Ligi', 5: 'Avrupa Ligi', 2286: 'Konferans Ligi',
  8: 'Premier League', 9: 'Championship', 82: 'Bundesliga', 564: 'La Liga', 384: 'Serie A', 301: 'Ligue 1',
  72: 'Eredivisie', 462: 'Liga Portugal', 208: 'Belçika Pro League', 501: 'İskoçya Premiership', 325: 'Yunanistan Super League',
  944: 'Suudi Pro Lig', 779: 'MLS', 648: 'Brezilya Serie A', 636: 'Arjantin Liga Profesional',
};

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
    data: teams.length ? { teams: teams.map((t) => ({ team_id: t.id, name: t.name })) } : { teams: [], note: 'not_found' },
    links: teams.slice(0, 1).map((t) => ({ label: t.name, href: `/teams/${t.id}` })),
  };
}

async function getFixtures(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (args.team_id != null) {
    const teamId = intArg(args.team_id, 'team_id');
    const overview = await getTeamOverview(String(teamId));
    const upcoming = overview.fixtures.slice(0, 3).map(matchItem);
    const recent = overview.recent.slice(0, 3).map(matchItem);
    // TV kanalı yalnız maç detayında: sıradaki maç için (maç sayfasıyla aynı önbellekli istek).
    if (upcoming[0]) {
      try {
        const detail = await lookupSportmonksFixture(String(upcoming[0].id));
        if (detail.kind === 'found' && detail.match.tv_stations?.length) upcoming[0] = { ...upcoming[0], tv: detail.match.tv_stations.slice(0, 4) };
      } catch {
        // kanal bilgisi alınamadı: yanıt kanalsız
      }
    }
    return {
      data: { team: overview.team?.name, upcoming: upcoming.map(forModel), recent: recent.map(forModel) },
      links: [...matchLinks(upcoming, 1), { label: overview.team?.name ?? 'Takım', href: `/teams/${teamId}` }],
      card: upcoming.length || recent.length ? { type: 'matches', matches: [...upcoming.slice(0, 2), ...recent.slice(0, 2)] } : undefined,
    };
  }
  const date = args.date == null ? ctx.todayIso : strArg(args.date, 'date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new ToolArgumentError('date YYYY-AA-GG olmalı');
  const leagueId = args.league_id == null ? null : leagueArg(args.league_id);
  const day = await loadHomeDay(date);
  let list = day.fixtureMatches;
  if (leagueId != null) list = list.filter((m) => Number(m.competition?.id ?? m.competition_id) === leagueId);
  const rank = (m: Match) => (Number(m.competition?.id ?? m.competition_id) === 600 ? 0 : 1);
  const items = [...list].sort((a, b) => rank(a) - rank(b) || (matchKickoffMs(a) ?? 0) - (matchKickoffMs(b) ?? 0)).map(matchItem);
  return {
    data: { date, total: items.length, matches: items.slice(0, 15).map(forModel) },
    links: [{ label: ctx.locale === 'tr' ? 'Tüm maçlar' : 'All matches', href: '/' }, ...matchLinks(items, 2)],
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
  return {
    data: {
      league: ASSISTANT_LEAGUES[leagueId],
      rows: rows.slice(0, 24).map((r) => ({ rank: r.rank, team: r.team?.name ?? r.name, played: r.matches, won: r.won, drawn: r.drawn, lost: r.lost, gd: r.goal_diff, points: r.points })),
    },
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
    description: 'Maçlar: bir günün maçları (date, isteğe bağlı league_id) ya da bir takımın sıradaki ve son maçları (team_id). Saat, skor, TV kanalı.',
    parameters: obj({ date: { type: 'string', description: 'YYYY-AA-GG (Türkiye günü); boşsa bugün' }, team_id: { type: 'integer' }, league_id: LEAGUE_ID }),
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
  get_rules: { description: 'Futbol kuralları (Kural Köşesi metinleri). topic: aranan konu (ör. ofsayt, VAR, uzatma).', parameters: obj({ topic: { type: 'string' } }, ['topic']), run: getRules },
  get_site_help: { description: 'Site yardımı: kredi, premium, analiz açma, hesap, asistan.', parameters: obj({ topic: { type: 'string', enum: [...ASSISTANT_HELP_TOPICS] } }, ['topic']), run: getSiteHelp },
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
