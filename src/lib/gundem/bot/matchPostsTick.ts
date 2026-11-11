/**
 * Maç öncesi / sonrası Gündem taslağı poller'ı (`POST /api/admin/gundem/bot-match-tick`, cron-job.org 15 dk). CANLI POLLING YOK:
 * yalnızca fikstür listesi (analiz ön üretimiyle aynı çağrı şekli → paylaşımlı cache), dört büyük/derbi için rakip listeleri (24 sa
 * cache) ve kayıtlı analiz okunur. Yayın YOK: yalnızca PENDING taslak yazar. Her adım ayrı yakalanır — biri çökerse tick 500 dönmez.
 */
import { BIG_FIVE, SUPER_LIG, UEFA_CLUB_LEAGUES } from '@/server/analysisPregen';
import type { Prisma } from '@prisma/client';
import { captureError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { loadIsDerby } from '@/server/teamRivals';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { sportmonksClientRequest, sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { RECAP_MAX_AGE_MS, buildRecapDraft, cheapRecapReasons, countRedCards, recapKey, selectRecapCandidates, type RecapReason } from './recapPost';
import type { Match } from '@/models/liveScore';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { loadNationalDay } from '@/server/apiFootball/nationalDay';
import { loadNationalStandings } from '@/server/apiFootball/nationalStandings';
import { FOCUS_NATIONAL_TEAM_ID } from '@/utils/nationalHomeStandings';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';
import {
  buildNationalPreview,
  buildNationalRecap,
  selectNationalPreview,
  selectNationalRecap,
  selectNationalScope,
  turkiyeCompetitionIds,
  type GroupRow,
  type NationalDraft,
} from './nationalPosts';
import {
  PREVIEW_WINDOW_MAX_MS,
  PREVIEW_WINDOW_MIN_MS,
  buildPreviewDraft,
  previewKey,
  selectPreviewCandidates,
  type PreviewFixture,
} from './previewPost';

type PassSummary = { candidates: number; created: number; existing: number; skipped: number; errors: number };
export type MatchPostsSummary = {
  preview: PassSummary & { noAnalysis: number; notDerby: number };
  recap: PassSummary & { noReason: number; evaluated: number };
  national: PassSummary & { scope: number };
};

export type MatchPostsDeps = {
  loadFixtures: (from: string, to: string) => Promise<PreviewFixture[]>;
  /** Bitmiş maçlar (skor + durum) — `from`/`to` UTC günleri. */
  loadFinished: (from: string, to: string) => Promise<PreviewFixture[]>;
  /** Maçın olayları (kırmızı kart sayımı için); tek maç, `include=events`. */
  loadEvents: (fixtureId: number) => Promise<Array<{ type_id: number }> | null>;
  /** "Değerlendirildi, koşul yok" işareti (Redis/in-memory): aynı maç için olay isteği tekrarlanmasın. */
  isEvaluated: (fixtureId: number) => Promise<boolean>;
  markEvaluated: (fixtureId: number) => Promise<void>;
  existingKeys: (keys: string[]) => Promise<Set<string>>;
  findAnalysis: typeof findStoredMatchAnalysis;
  isDerby: (homeId: number, awayId: number) => Promise<boolean | null>;
  createDraft: (data: { externalKey: string; kind: string; fixtureId: number; body: string; facts: unknown; warnings: string[] }) => Promise<void>;
  /** Milli maçlar (API-Football): dün/bugün/yarın (TR günleri) listesi; milli maç bayrağı kapalıysa boş. */
  loadNationalMatches: () => Promise<Match[]>;
  /** Turnuvada Türkiye'nin grubu (yoksa null). */
  loadTurkiyeGroup: (competitionId: number) => Promise<GroupRow[] | null>;
  now?: () => number;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Analiz ön üretimi (`analysisPregen.loadWindowFixtures`) ile AYNI çağrı şekli: aynı gün aralığında paylaşımlı cache'ten gelir. */
export function loadWindowFixtures(from: string, to: string): Promise<PreviewFixture[]> {
  return sportmonksCollectAllPages<PreviewFixture>({
    basePath: 'football',
    path: `/fixtures/between/${from}/${to}`,
    perPage: 50,
    maxPages: 4,
    extraParams: { include: 'participants', filters: `fixtureLeagues:${[SUPER_LIG, ...UEFA_CLUB_LEAGUES, ...BIG_FIVE].join(',')}` },
  });
}

/** Maç sonu listesi: yalnızca takip edilen kapsamdaki ligler; skor + durum için `scores;state` (olaylar maç başına ayrı, yalnız gerekirse). */
export function loadFinishedFixtures(from: string, to: string): Promise<PreviewFixture[]> {
  return sportmonksCollectAllPages<PreviewFixture>({
    basePath: 'football',
    path: `/fixtures/between/${from}/${to}`,
    perPage: 50,
    maxPages: 4,
    extraParams: { include: 'participants;scores;state', filters: `fixtureLeagues:${[SUPER_LIG, ...UEFA_CLUB_LEAGUES, ...BIG_FIVE].join(',')}` },
  });
}

/** Puan durumundan Türkiye'nin grubu: tek tablo ya da gruplu aşama. */
export function turkiyeGroupFromTable(data: CompetitionTableData): GroupRow[] | null {
  const tables: CompetitionTableStandingRow[][] = [];
  if (data.table) tables.push(data.table);
  for (const st of data.stages ?? []) for (const g of st.groups ?? []) if (g.standings) tables.push(g.standings);
  const group = tables.find((t) => t.some((r) => Number(r.team_id) === FOCUS_NATIONAL_TEAM_ID));
  if (!group) return null;
  return group.map((r) => ({ teamId: Number(r.team_id), name: String(r.name ?? r.team?.name ?? ''), rank: Number(r.rank), points: Number(r.points ?? 0), played: Number(r.matches ?? 0) }));
}

async function defaultLoadNationalMatches(): Promise<Match[]> {
  if (!nationalMatchesEnabled()) return [];
  const today = todayIsoIstanbul();
  const days = [shiftIsoDate(today, -1), today, shiftIsoDate(today, 1)];
  const res = await Promise.all(days.map((d) => loadNationalDay(d)));
  return res.flatMap((r) => (r.ok ? r.matches : []));
}

async function defaultLoadTurkiyeGroup(competitionId: number): Promise<GroupRow[] | null> {
  const r = await loadNationalStandings(String(competitionId));
  return r.kind === 'found' ? turkiyeGroupFromTable(r.data) : null;
}

const evalKey = (id: number) => `gundem-bot:recap-eval:${id}`;

export const defaultMatchPostsDeps: MatchPostsDeps = {
  loadFixtures: loadWindowFixtures,
  loadFinished: loadFinishedFixtures,
  loadEvents: async (id) =>
    ((await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${id}`, { include: 'events' })).data as SportmonksFixture | null)?.events ?? null,
  isEvaluated: async (id) => (await readCache(evalKey(id))) != null,
  markEvaluated: (id) => writeCache(evalKey(id), 1, Math.floor(RECAP_MAX_AGE_MS / 1000)),
  existingKeys: async (keys) => {
    if (keys.length === 0) return new Set();
    const rows = await prisma.gundemBotDraft.findMany({ where: { externalKey: { in: keys } }, select: { externalKey: true } });
    return new Set(rows.map((r) => r.externalKey));
  },
  findAnalysis: findStoredMatchAnalysis,
  isDerby: loadIsDerby,
  loadNationalMatches: defaultLoadNationalMatches,
  loadTurkiyeGroup: defaultLoadTurkiyeGroup,
  createDraft: async (d) => {
    await prisma.gundemBotDraft.create({
      data: { externalKey: d.externalKey, kind: d.kind, fixtureId: d.fixtureId, body: d.body, facts: d.facts as Prisma.InputJsonValue, warnings: d.warnings },
    });
  },
};

export async function runPreviewPass(deps: MatchPostsDeps, now: number): Promise<MatchPostsSummary['preview']> {
  const s = { candidates: 0, created: 0, existing: 0, noAnalysis: 0, notDerby: 0, skipped: 0, errors: 0 };
  let fixtures: PreviewFixture[];
  try {
    fixtures = await deps.loadFixtures(isoDay(now + PREVIEW_WINDOW_MIN_MS), isoDay(now + PREVIEW_WINDOW_MAX_MS));
  } catch (e) {
    captureError('gundem:match-tick:preview-fixtures', e);
    return { ...s, errors: 1 };
  }
  const candidates = selectPreviewCandidates(fixtures, now);
  s.candidates = candidates.length;
  let existing: Set<string>;
  try {
    existing = await deps.existingKeys(candidates.map((c) => previewKey(c.fixture.id)));
  } catch (e) {
    captureError('gundem:match-tick:preview-existing', e);
    return { ...s, errors: 1 };
  }

  for (const c of candidates) {
    try {
      if (existing.has(previewKey(c.fixture.id))) {
        s.existing += 1;
        continue;
      }
      // Önce analiz (DB, ücretsiz): yoksa derbi sorgusuyla Sportmonks'a hiç gidilmez ve analiz ÜRETİLMEZ.
      const analysis = await deps.findAnalysis(String(c.fixture.id), 'PRE');
      if (!analysis) {
        s.noAnalysis += 1;
        continue;
      }
      if (c.reason === 'big5-derby' && (await deps.isDerby(c.homeId, c.awayId)) !== true) {
        s.notDerby += 1;
        continue;
      }
      const draft = buildPreviewDraft(c, analysis);
      if (!draft) {
        s.skipped += 1;
        continue;
      }
      try {
        await deps.createDraft({ externalKey: draft.externalKey, kind: 'PREVIEW', fixtureId: c.fixture.id, body: draft.body, facts: draft.facts, warnings: draft.warnings });
        s.created += 1;
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') s.existing += 1; // eşzamanlı tick
        else throw e;
      }
    } catch (e) {
      s.errors += 1;
      captureError('gundem:match-tick:preview', e);
    }
  }
  return s;
}

export async function runRecapPass(deps: MatchPostsDeps, now: number): Promise<MatchPostsSummary['recap']> {
  const s = { candidates: 0, created: 0, existing: 0, noReason: 0, evaluated: 0, skipped: 0, errors: 0 };
  let fixtures: PreviewFixture[];
  try {
    fixtures = await deps.loadFinished(isoDay(now - RECAP_MAX_AGE_MS), isoDay(now));
  } catch (e) {
    captureError('gundem:match-tick:recap-fixtures', e);
    return { ...s, errors: 1 };
  }
  const candidates = selectRecapCandidates(fixtures, now);
  s.candidates = candidates.length;
  let existing: Set<string>;
  try {
    existing = await deps.existingKeys(candidates.map((c) => recapKey(c.fixture.id)));
  } catch (e) {
    captureError('gundem:match-tick:recap-existing', e);
    return { ...s, errors: 1 };
  }

  for (const c of candidates) {
    try {
      if (existing.has(recapKey(c.fixture.id))) {
        s.existing += 1;
        continue;
      }
      if (await deps.isEvaluated(c.fixture.id)) {
        s.evaluated += 1;
        continue;
      }
      // Ucuzdan pahalıya: skor/durum → derbi (rakip listesi, 24 sa cache) → olaylar (maç başına tek istek, yalnız önceki koşul yoksa).
      const reasons: RecapReason[] = cheapRecapReasons(c);
      const derby = await deps.isDerby(c.homeId, c.awayId);
      if (derby === null) {
        s.skipped += 1; // rakip listesi okunamadı → karar verilemedi; sonraki tick yeniden dener, işaret konmaz
        continue;
      }
      if (derby) reasons.push('derby');
      let redCards = 0;
      if (reasons.length === 0) {
        const events = await deps.loadEvents(c.fixture.id);
        if (events === null) {
          s.skipped += 1;
          continue;
        }
        redCards = countRedCards(events);
        if (redCards > 0) reasons.push('red-card');
      }
      const draft = buildRecapDraft(c, reasons, redCards);
      if (!draft) {
        s.noReason += 1;
        await deps.markEvaluated(c.fixture.id);
        continue;
      }
      try {
        await deps.createDraft({ externalKey: draft.externalKey, kind: 'RECAP', fixtureId: c.fixture.id, body: draft.body, facts: draft.facts, warnings: draft.warnings });
        s.created += 1;
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') s.existing += 1;
        else throw e;
      }
    } catch (e) {
      s.errors += 1;
      captureError('gundem:match-tick:recap', e);
    }
  }
  return s;
}

/**
 * Milli maçlar: Türkiye maçı + Türkiye'nin grubundaki maçlar için maç önü (1–2 sa kala) ve maç sonu taslağı. Puan durumu yalnız
 * Türkiye'nin o günlerde oynadığı turnuvalar için okunur (10 dk önbellekli). Analiz varsa önizlemesi, yoksa grup şablonu.
 */
export async function runNationalPass(deps: MatchPostsDeps, now: number): Promise<MatchPostsSummary['national']> {
  const s = { candidates: 0, created: 0, existing: 0, skipped: 0, errors: 0, scope: 0 };
  let matches: Match[];
  try {
    matches = await deps.loadNationalMatches();
  } catch (e) {
    captureError('gundem:match-tick:national-matches', e);
    return { ...s, errors: 1 };
  }
  if (matches.length === 0) return s;
  const groups = new Map<number, GroupRow[]>();
  for (const id of turkiyeCompetitionIds(matches)) {
    try {
      const g = await deps.loadTurkiyeGroup(id);
      if (g) groups.set(id, g);
    } catch (e) {
      captureError('gundem:match-tick:national-group', e);
    }
  }
  const scope = selectNationalScope(matches, groups);
  s.scope = scope.length;
  const previews = selectNationalPreview(scope, now);
  const recaps = selectNationalRecap(scope, now);
  s.candidates = previews.length + recaps.length;
  if (s.candidates === 0) return s;
  let existing: Set<string>;
  try {
    existing = await deps.existingKeys([...previews.map((m) => previewKey(m.id)), ...recaps.map((m) => recapKey(m.id))]);
  } catch (e) {
    captureError('gundem:match-tick:national-existing', e);
    return { ...s, errors: 1 };
  }
  const jobs: Array<() => Promise<NationalDraft | null>> = [
    ...previews.map((m) => async () => {
      if (existing.has(previewKey(m.id))) return null;
      const analysis = await deps.findAnalysis(String(m.id), 'PRE');
      return buildNationalPreview(m, groups.get(Number(m.competition?.id)), analysis);
    }),
    ...recaps.map((m) => async () => (existing.has(recapKey(m.id)) ? null : buildNationalRecap(m))),
  ];
  for (const job of jobs) {
    try {
      const draft = await job();
      if (!draft) {
        s.existing += 1;
        continue;
      }
      try {
        await deps.createDraft(draft);
        s.created += 1;
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') s.existing += 1;
        else throw e;
      }
    } catch (e) {
      s.errors += 1;
      captureError('gundem:match-tick:national', e);
    }
  }
  return s;
}

export async function runMatchPostsTick(deps: MatchPostsDeps = defaultMatchPostsDeps): Promise<MatchPostsSummary> {
  const now = deps.now?.() ?? Date.now();
  // Bağımsız geçişler: biri çökerse diğeri yine çalışır (her biri kendi içinde yakalar).
  const [preview, recap, national] = await Promise.all([runPreviewPass(deps, now), runRecapPass(deps, now), runNationalPass(deps, now)]);
  return { preview, recap, national };
}
