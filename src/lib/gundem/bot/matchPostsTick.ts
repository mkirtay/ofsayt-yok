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
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import {
  PREVIEW_WINDOW_MAX_MS,
  PREVIEW_WINDOW_MIN_MS,
  buildPreviewDraft,
  previewKey,
  selectPreviewCandidates,
  type PreviewFixture,
} from './previewPost';

export type MatchPostsSummary = {
  preview: { candidates: number; created: number; existing: number; noAnalysis: number; notDerby: number; skipped: number; errors: number };
};

export type MatchPostsDeps = {
  loadFixtures: (from: string, to: string) => Promise<PreviewFixture[]>;
  existingKeys: (keys: string[]) => Promise<Set<string>>;
  findAnalysis: typeof findStoredMatchAnalysis;
  isDerby: (homeId: number, awayId: number) => Promise<boolean | null>;
  createDraft: (data: { externalKey: string; kind: string; fixtureId: number; body: string; facts: unknown; warnings: string[] }) => Promise<void>;
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

export const defaultMatchPostsDeps: MatchPostsDeps = {
  loadFixtures: loadWindowFixtures,
  existingKeys: async (keys) => {
    if (keys.length === 0) return new Set();
    const rows = await prisma.gundemBotDraft.findMany({ where: { externalKey: { in: keys } }, select: { externalKey: true } });
    return new Set(rows.map((r) => r.externalKey));
  },
  findAnalysis: findStoredMatchAnalysis,
  isDerby: loadIsDerby,
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

export async function runMatchPostsTick(deps: MatchPostsDeps = defaultMatchPostsDeps): Promise<MatchPostsSummary> {
  const now = deps.now?.() ?? Date.now();
  return { preview: await runPreviewPass(deps, now) };
}
