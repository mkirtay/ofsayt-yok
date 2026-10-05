/**
 * AI Asistan — maç analizi isteği ("GS–Kasımpaşa maçını analiz et"). v2'de `get_match_analysis` aracının
 * yürütücüsü (server/assistant/tools.ts); erişim kararı burada, oturumdaki kullanıcıyla verilir.
 *
 * Akış (burada LLM yok, yeni üretim YOK):
 *   1. Niyet: metinde "analiz" + iki takım ifadesi.
 *   2. Takım: takma ad sözlüğü (content/teamNames.ts) → yoksa mevcut Sportmonks takım araması (`teams/search`).
 *   3. Maç: takımın fikstürü (takım sayfasıyla aynı önbellekli `teams/{id}` genel bakış isteği) içinde rakip.
 *      Birden fazla aday → en çok 3 seçenek.
 *   4. Erişim (kredi modeli v2, server/analysisAccess.ts ile aynı kural):
 *      - açılmış (AnalysisUnlock) / premium / yönetici / maç bitmiş → kısa özet (en olası sonuç + 2-3 nokta)
 *      - hazır ama kilitli → YALNIZ ücretsiz önizleme (buildAnalysisPreview) + açma teklifi; kilitli alan yanıtta yok
 *      - analiz yok → kapsamdaysa ve maça 3 saatten çok varsa "maçtan ~3 saat önce hazırlanır"; maç başlamadıysa
 *        "maç sayfasından kendin üretebilirsin" yönlendirmesi; başladıysa "hazırlanmıyor" (noAnalysisReason).
 *        Asistan hiçbir koşulda üretim yapmaz, kredi harcamaz.
 */
import type { MatchAnalysis } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TEAM_NAMES } from '@/content/teamNames';
import { normalizeSearchText } from '@/utils/searchText';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { getTeamOverview } from '@/services/teamPage';
import type { TeamMatch } from '@/services/sportmonks/teamOverview';
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { ANALYSIS_UNLOCK_COST, findUnlock } from '@/lib/analysisUnlock';
import { isAdminUser, isPremiumUser } from '@/lib/premium';
import { isAnalysisMatchFinished, type AnalysisViewer } from '@/server/analysisAccess';
import { isInPregenScope } from '@/server/analysisPregen';
import { buildAnalysisPreview, type AnalysisPreview, type PreviewOutcome } from '@/utils/analysisPreview';
import { sanitizeLegacyAnalysis, splitSentences } from '@/utils/analysisSanitize';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { buildMatchHref } from '@/utils/matchUrl';

// ─── 1. Niyet ────────────────────────────────────────────────────────────────

const ANALYSIS_WORD = /anali[zs]/i;
/**
 * Takım adlarını ayıran işaretler: "GS–Kasımpaşa", "GS - Kasımpaşa", "GS vs Kasımpaşa", "GS ile Kasımpaşa".
 * `\b` Türkçe harflerde çalışmadığı için harf sınırı `\p{L}` ile (bkz. utils/gamblingTerms.ts).
 */
const SEPARATOR = /\s*[–—-]\s*|(?<![\p{L}\p{N}])(?:vs\.?|v\.|ile|karşı|karsi)(?![\p{L}\p{N}])/iu;
/** Takım ifadesinden atılan istek kelimeleri (normalize edilmiş, kelime kelime). */
const NOISE_WORD =
  /^(mac(i|ini|inin|in)?|analiz\p{L}*|analys\p{L}*|analyz\p{L}*|et|eder|etsene|edin|misin|misiniz|yap|yapar|ver|verir|icin|lutfen|bana|bir|the|match|please|of|for)$/u;

export type AnalysisIntent = { home: string; away: string };

function stripNoise(part: string): string {
  return part
    .replace(/[?!.,"'“”‘’]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORD.test(normalizeSearchText(w)))
    .join(' ')
    .trim();
}

export function parseMatchAnalysisIntent(text: string): AnalysisIntent | null {
  const raw = text.trim();
  if (!raw || raw.length > 200 || !ANALYSIS_WORD.test(raw)) return null;
  const named = raw.split(SEPARATOR).map(stripNoise).filter((p) => p.length > 0);
  if (named.length !== 2) return null;
  return { home: named[0]!, away: named[1]! };
}

// ─── 2. Takım ────────────────────────────────────────────────────────────────

export type TeamCandidate = { id: number; name: string };

const strip = (s: string) => normalizeSearchText(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Takma ad sözlüğünde birebir (normalize) eşleşme; sözlükte olmayan takım için boş. */
export function resolveTeamFromAliases(raw: string): TeamCandidate[] {
  const q = strip(raw);
  if (!q) return [];
  const out: TeamCandidate[] = [];
  for (const [id, entry] of Object.entries(TEAM_NAMES)) {
    const names = [entry.name, entry.shortName, ...entry.aliases].map(strip);
    if (names.includes(q)) out.push({ id: Number(id), name: entry.name });
  }
  return out;
}

export async function resolveTeam(raw: string): Promise<TeamCandidate[]> {
  const local = resolveTeamFromAliases(raw);
  if (local.length) return local;
  // Mevcut takım araması (başlık araması / karşılaştırma ile aynı uç, 24 sa önbellek).
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return [];
  try {
    const env = await sportmonksClientRequest<Array<{ id: number; name: string }>>('football', `/teams/search/${encodeURIComponent(q)}`, {});
    return (env.data ?? []).slice(0, 3).map((t) => ({ id: t.id, name: t.name }));
  } catch {
    return [];
  }
}

// ─── 3. Maç ──────────────────────────────────────────────────────────────────

export type FixtureCandidate = {
  id: number;
  home: string;
  away: string;
  kickoffMs: number | null;
  status: string;
  /** Ön üretim kapsamı kontrolü için (fikstürden geliyorsa dolu). */
  leagueId?: number;
  homeId?: number;
  awayId?: number;
};

const kickoff = (m: TeamMatch): number | null => (typeof m.kickoff_ts === 'number' ? m.kickoff_ts : null);

/** İki takımın fikstürdeki karşılaşmaları; önce en yakın oynanmamış, sonra en yeni oynanmış. */
export function pickFixtures(overview: { recent: TeamMatch[]; fixtures: TeamMatch[] }, opponentIds: Set<number>): FixtureCandidate[] {
  const isVs = (m: TeamMatch) => opponentIds.has(Number(m.home?.id)) || opponentIds.has(Number(m.away?.id));
  const toCandidate = (m: TeamMatch): FixtureCandidate => ({
    id: m.id,
    home: m.home?.name ?? '',
    away: m.away?.name ?? '',
    kickoffMs: kickoff(m),
    status: m.status,
    leagueId: Number(m.competition?.id ?? m.competition_id) || undefined,
    homeId: Number(m.home?.id) || undefined,
    awayId: Number(m.away?.id) || undefined,
  });
  return [...overview.fixtures.filter(isVs), ...overview.recent.filter(isVs)].map(toCandidate);
}

async function findFixtures(home: TeamCandidate[], away: TeamCandidate[]): Promise<FixtureCandidate[]> {
  const awayIds = new Set(away.map((t) => t.id));
  const seen = new Set<number>();
  const out: FixtureCandidate[] = [];
  for (const team of home.slice(0, 3)) {
    try {
      const overview = await getTeamOverview(String(team.id));
      for (const c of pickFixtures(overview, awayIds)) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
    } catch {
      // Takım verisi alınamadı: diğer adaylarla devam.
    }
  }
  return out;
}

// ─── 4. Yanıt kartı ──────────────────────────────────────────────────────────

export type AssistantMatchRef = { id: number; home: string; away: string; kickoffMs: number | null; href: string };

export type AssistantAnalysisCard =
  | { kind: 'not-understood' }
  | { kind: 'team-not-found'; query: string }
  | { kind: 'match-not-found'; home: string; away: string }
  | { kind: 'choose'; options: AssistantMatchRef[] }
  /**
   * `scheduled`: ön üretim kapsamında ve maça 3 saatten çok var ("~3 saat önce hazırlanır").
   * `self-serve`: hazır analiz yok ve hazırlanmayacak ama maç başlamadı → kullanıcı maç sayfasından kendi üretebilir
   *   (asistan üretmez, yalnız yönlendirir). `not-planned`: maç başlamış / bitmiş / saati bilinmiyor.
   */
  | { kind: 'none'; match: AssistantMatchRef; reason: NoAnalysisReason; signedIn: boolean; cost: number }
  | { kind: 'locked'; match: AssistantMatchRef; preview: AnalysisPreview; cost: number; signedIn: boolean }
  | { kind: 'summary'; match: AssistantMatchRef; top: { outcome: PreviewOutcome; pct: number } | null; points: string[] };

/** Maç sayfasının AI sekmesi (MatchDetailContent `?sekme=ai-analiz`). */
export const AI_TAB_QUERY = 'sekme=ai-analiz';

function matchRef(c: Pick<FixtureCandidate, 'id' | 'home' | 'away' | 'kickoffMs'>): AssistantMatchRef {
  return {
    id: c.id,
    home: c.home,
    away: c.away,
    kickoffMs: c.kickoffMs,
    href: `${buildMatchHref({ id: c.id, home: { name: c.home }, away: { name: c.away } })}?${AI_TAB_QUERY}`,
  };
}

const POINT_MAX = 220;
function cleanSentence(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const first = splitSentences(s.trim())[0]?.trim();
  if (!first || findGamblingTerms(first).length) return null;
  return first.length <= POINT_MAX ? first : `${first.slice(0, POINT_MAX - 1).replace(/\s+\S*$/, '')}…`;
}

/** Erişimi olan kullanıcıya: en olası sonuç + 2-3 nokta (analist yorumu, sonuç gerekçesi, baskın taraf). */
export function buildAnalysisSummary(row: MatchAnalysis): { top: AnalysisPreview['top']; points: string[] } {
  const clean = sanitizeLegacyAnalysis(row);
  const report = (clean.fullReport ?? {}) as { analystComment?: unknown; matchSummary?: { dominantSide?: unknown } };
  const prediction = (clean.matchPrediction ?? {}) as { reasoning?: unknown };
  const analyst = typeof report.analystComment === 'string' ? splitSentences(report.analystComment.trim()) : [];
  const points = [cleanSentence(analyst[0]), cleanSentence(prediction.reasoning), cleanSentence(analyst[1]) ?? cleanSentence(report.matchSummary?.dominantSide)]
    .filter((p): p is string => Boolean(p))
    .slice(0, 3);
  return { top: buildAnalysisPreview(row).top, points };
}

/** Analiz maçtan yaklaşık bu kadar önce hazırlanır (ön üretim penceresi 2 sa – 3 sa 15 dk; kullanıcıya "3 saat"). */
export const ANALYSIS_READY_BEFORE_MS = 3 * 60 * 60_000;

export type NoAnalysisReason = 'scheduled' | 'self-serve' | 'not-planned';

/**
 * Analizi olmayan maç:
 * - başlamış / bitmiş / başlama saati bilinmiyor → `not-planned` (artık üretilemez);
 * - ön üretim kapsamında ve başlamasına 3 saatten çok var → `scheduled` ("yaklaşık 3 saat önce hazırlanır");
 * - aksi halde (kapsam dışı lig ya da 3 saatten az kalmış) → `self-serve`: kullanıcı maç sayfasından kendi üretebilir.
 */
export async function noAnalysisReason(match: FixtureCandidate, now: number = Date.now()): Promise<NoAnalysisReason> {
  if (match.kickoffMs == null || match.kickoffMs <= now) return 'not-planned';
  if (match.status && match.status !== 'NOT STARTED') return 'not-planned';
  if (match.kickoffMs - now > ANALYSIS_READY_BEFORE_MS && (await isInPregenScope(match))) return 'scheduled';
  return 'self-serve';
}

export async function analysisCardForMatch(viewer: AnalysisViewer | null, match: FixtureCandidate): Promise<AssistantAnalysisCard> {
  const ref = matchRef(match);
  const stored = await findStoredMatchAnalysis(String(match.id), 'PRE');
  if (!stored) return { kind: 'none', match: ref, reason: await noAnalysisReason(match), signedIn: viewer != null, cost: ANALYSIS_UNLOCK_COST };
  const privileged = viewer != null && (isAdminUser(viewer) || isPremiumUser(viewer));
  const unlocked = viewer != null && (await findUnlock(viewer.id, stored.id)) != null;
  const open =
    privileged ||
    unlocked ||
    (await isAnalysisMatchFinished(stored, await prisma.predictionRecord.findUnique({ where: { matchAnalysisId: stored.id }, select: { evaluatedAt: true } })));
  if (open) return { kind: 'summary', match: ref, ...buildAnalysisSummary(stored) };
  return { kind: 'locked', match: ref, preview: buildAnalysisPreview(stored), cost: ANALYSIS_UNLOCK_COST, signedIn: viewer != null };
}

/** İki takım ifadesinden kart (asistanın `get_match_analysis` aracı ve serbest metin akışı ortak kullanır). */
export async function analysisCardForTeams(viewer: AnalysisViewer | null, homeQuery: string, awayQuery: string): Promise<AssistantAnalysisCard> {
  const [home, away] = await Promise.all([resolveTeam(homeQuery), resolveTeam(awayQuery)]);
  if (!home.length) return { kind: 'team-not-found', query: homeQuery };
  if (!away.length) return { kind: 'team-not-found', query: awayQuery };
  const fixtures = await findFixtures(home, away);
  if (!fixtures.length) return { kind: 'match-not-found', home: home[0]!.name, away: away[0]!.name };
  if (fixtures.length > 1 && (home.length > 1 || away.length > 1)) return { kind: 'choose', options: fixtures.slice(0, 3).map(matchRef) };
  return analysisCardForMatch(viewer, fixtures[0]!);
}

/** Serbest metinden kart (niyet yoksa `not-understood`). */
export async function answerMatchAnalysisRequest(viewer: AnalysisViewer | null, text: string): Promise<AssistantAnalysisCard> {
  const intent = parseMatchAnalysisIntent(text);
  if (!intent) return { kind: 'not-understood' };
  return analysisCardForTeams(viewer, intent.home, intent.away);
}
