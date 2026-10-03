/**
 * Popüler maçların AI analizini maçtan ~3 saat önce arka planda üretir (tetikleyici: GitHub Actions, 15 dk'da bir →
 * `POST /api/admin/analysis-pregenerate`).
 *
 * Kapsam: Süper Lig'in tamamı · Türk takımlarının Avrupa maçları (ŞL/AL/KL) · büyük 5 ligde iki takımın da lig
 * sıralamasında ilk 6'da olduğu maçlar. Pencere: başlama saati 2 sa – 3 sa 15 dk sonra (GitHub cron gecikmesine pay;
 * maç zaten analizliyse atlanır → tek üretim, yeniden üretim yok). Muhtemel 11 ve güncel sakat listesi bu saatte hazır.
 * Kullanıcı isteğiyle aynı Redis kilidi (lib/analysisGenerationLock) — ikisi aynı maçı aynı anda üretmez.
 */
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { getCompetitionTableFull, type CompetitionTableData } from '@/services/liveScoreService';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { saveGeneratedAnalysis } from '@/server/saveMatchAnalysis';
import { generateMatchAnalysis } from '@/services/aiAnalysisService';
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { acquireAnalysisLock, releaseAnalysisLock } from '@/lib/analysisGenerationLock';
import { ensurePredictionRecordForAnalysis } from '@/lib/predictionRecords';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { isUniqueViolation } from '@/lib/credits';
import { captureError } from '@/lib/logger';

export const SUPER_LIG = 600;
export const UEFA_CLUB_LEAGUES = [2, 5, 2286] as const;
/** Premier League, Bundesliga, Ligue 1, Serie A, La Liga. */
export const BIG_FIVE = [8, 82, 301, 384, 564] as const;
export const TURKEY_COUNTRY_ID = 404;
export const BIG_FIVE_TOP_RANK = 6;
export const PREGEN_WINDOW_MIN_MS = 2 * 60 * 60_000;
export const PREGEN_WINDOW_MAX_MS = 3 * 60 * 60_000 + 15 * 60_000;
/** Çağrı başına en fazla üretim (her biri ~15 sn; fonksiyon süresi sınırı içinde kalır). */
export const PREGEN_MAX_PER_RUN = 3;

/** `participants` include'unun burada kullanılan alanları (genel tipte `country_id` yok). */
type PregenFixture = Omit<SportmonksFixture, 'participants'> & { starting_at_timestamp?: number | null; participants?: Array<{ id: number; name?: string; country_id?: number | null }> };

export type PregenCandidate = { id: number; name: string; leagueId: number; kickoffMs: number; reason: 'super-lig' | 'uefa-turkish' | 'big5-top' };

function kickoffMs(f: PregenFixture): number | null {
  if (typeof f.starting_at_timestamp === 'number') return f.starting_at_timestamp * 1000;
  const t = f.starting_at ? Date.parse(f.starting_at.replace(' ', 'T') + 'Z') : NaN;
  return Number.isFinite(t) ? t : null;
}

/** Bir lig tablosunda ilk `rank` sıradaki takım id'leri (gruplu tablolar dahil). */
export function topTeamIds(table: CompetitionTableData | null, rank = BIG_FIVE_TOP_RANK): Set<number> {
  const rows = [...(table?.table ?? []), ...(table?.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []))];
  const ids = new Set<number>();
  for (const r of rows) {
    const id = Number(r.team?.id ?? r.team_id);
    if (Number.isFinite(id) && r.rank <= rank) ids.add(id);
  }
  return ids;
}

/** Saf seçim: pencere + kapsam kuralları; başlama saatine göre sıralı. */
export function selectPregenCandidates(
  fixtures: PregenFixture[],
  opts: { now: number; topTeamsByLeague: Map<number, Set<number>> },
): PregenCandidate[] {
  const out: PregenCandidate[] = [];
  for (const f of fixtures) {
    const ko = kickoffMs(f);
    if (ko == null || ko - opts.now < PREGEN_WINDOW_MIN_MS || ko - opts.now > PREGEN_WINDOW_MAX_MS) continue;
    if (f.state_id != null && f.state_id !== 1) continue; // 1 = NS (başlamadı); ertelenen/iptal üretilmez
    const league = Number(f.league_id);
    const teams = f.participants ?? [];
    let reason: PregenCandidate['reason'] | null = null;
    if (league === SUPER_LIG) reason = 'super-lig';
    else if ((UEFA_CLUB_LEAGUES as readonly number[]).includes(league) && teams.some((t) => t.country_id === TURKEY_COUNTRY_ID)) reason = 'uefa-turkish';
    else if ((BIG_FIVE as readonly number[]).includes(league)) {
      const top = opts.topTeamsByLeague.get(league);
      if (top && teams.length === 2 && teams.every((t) => top.has(Number(t.id)))) reason = 'big5-top';
    }
    if (!reason) continue;
    out.push({ id: f.id, name: f.name ?? teams.map((t) => t.name).join(' vs '), leagueId: league, kickoffMs: ko, reason });
  }
  return out.sort((a, b) => a.kickoffMs - b.kickoffMs);
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function loadWindowFixtures(now: number): Promise<PregenFixture[]> {
  const from = isoDay(now + PREGEN_WINDOW_MIN_MS);
  const to = isoDay(now + PREGEN_WINDOW_MAX_MS);
  return sportmonksCollectAllPages<PregenFixture>({
    basePath: 'football',
    path: `/fixtures/between/${from}/${to}`,
    perPage: 50,
    maxPages: 4,
    extraParams: { include: 'participants', filters: `fixtureLeagues:${[SUPER_LIG, ...UEFA_CLUB_LEAGUES, ...BIG_FIVE].join(',')}` },
  });
}

export type PregenItem = {
  matchId: number;
  name: string;
  reason: PregenCandidate['reason'];
  status: 'generated' | 'exists' | 'locked' | 'not-pre' | 'no-context' | 'error' | 'dry-run';
  ms?: number;
  tokens?: number;
  modelVersion?: string;
  sportmonksCalls?: number;
  sportmonksUpstream?: number;
  error?: string;
};

export type PregenResult = {
  candidates: number;
  /** Aday seçimi (fikstür listesi + büyük 5 tabloları) için Sportmonks çağrıları. */
  selection: { sportmonksCalls: number; sportmonksUpstream: number };
  items: PregenItem[];
  ms: number;
};

async function generateOne(c: PregenCandidate): Promise<PregenItem> {
  const base = { matchId: c.id, name: c.name, reason: c.reason };
  if (await findStoredMatchAnalysis(String(c.id), 'PRE')) return { ...base, status: 'exists' };
  const lock = await acquireAnalysisLock(String(c.id));
  if (!lock) return { ...base, status: 'locked' };
  const t0 = Date.now();
  try {
    // Kilit alınırken bir kullanıcı üretip bırakmış olabilir.
    if (await findStoredMatchAnalysis(String(c.id), 'PRE')) return { ...base, status: 'exists' };
    const tracked = await trackSportmonksFetches(() => buildMatchAnalysisContext(String(c.id)));
    const sm = { sportmonksCalls: tracked.calls, sportmonksUpstream: tracked.upstream };
    const ctx = tracked.value;
    if (!ctx || ctx.archived) return { ...base, ...sm, status: 'no-context', ms: Date.now() - t0 };
    if (ctx.matchPhase !== 'PRE') return { ...base, ...sm, status: 'not-pre', ms: Date.now() - t0 };
    const ai = await generateMatchAnalysis(ctx);
    try {
      const saved = await saveGeneratedAnalysis(ctx, ai);
      try {
        await ensurePredictionRecordForAnalysis(saved);
      } catch (e) {
        captureError('analysis-pregen-prediction-record', e);
      }
    } catch (e) {
      if (isUniqueViolation(e)) return { ...base, ...sm, status: 'exists', ms: Date.now() - t0 };
      throw e;
    }
    return { ...base, ...sm, status: 'generated', ms: Date.now() - t0, tokens: ai.tokensUsed, modelVersion: ai.modelVersion };
  } catch (e) {
    captureError('analysis-pregen', e);
    return { ...base, status: 'error', ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  } finally {
    await releaseAnalysisLock(lock);
  }
}

export async function runAnalysisPregen(opts: { now?: number; dryRun?: boolean; maxPerRun?: number } = {}): Promise<PregenResult> {
  const t0 = Date.now();
  const now = opts.now ?? Date.now();
  const selection = await trackSportmonksFetches(async () => {
    const fixtures = await loadWindowFixtures(now);
    const big5 = [...new Set(fixtures.map((f) => Number(f.league_id)).filter((l) => (BIG_FIVE as readonly number[]).includes(l)))];
    const tables = await Promise.all(big5.map(async (l) => [l, topTeamIds(await getCompetitionTableFull(String(l)).catch(() => null))] as const));
    return selectPregenCandidates(fixtures, { now, topTeamsByLeague: new Map(tables) });
  });
  const candidates = selection.value;
  const items: PregenItem[] = [];
  let generated = 0;
  for (const c of candidates) {
    if (opts.dryRun) {
      items.push({ matchId: c.id, name: c.name, reason: c.reason, status: 'dry-run' });
      continue;
    }
    if (generated >= (opts.maxPerRun ?? PREGEN_MAX_PER_RUN)) break;
    const item = await generateOne(c);
    if (item.status === 'generated' || item.status === 'error') generated++;
    console.log(JSON.stringify({ event: 'analysis-pregen', ...item }));
    items.push(item);
  }
  return {
    candidates: candidates.length,
    selection: { sportmonksCalls: selection.calls, sportmonksUpstream: selection.upstream },
    items,
    ms: Date.now() - t0,
  };
}
