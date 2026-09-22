/**
 * Bot poller (`POST /api/admin/gundem/bot-tick`, dakikada bir harici cron). `livescores/inplay` TAM durumunu verir → olay kaçmaz;
 * fark `externalKey` (unique) ile çıkarılır. YALNIZCA takip edilen liglerin canlı maçları işlenir. Yayın YOK: sadece PENDING taslak yazar.
 *
 * Neden `livescores/latest` değil: yalnızca son 10 sn'de güncellenen fixture'ları döndürür; 1 dk'lık tetiklemede olay kaçırır.
 */
import type { Prisma } from '@prisma/client';
import { getBotLeagueIds, MAX_NEW_DRAFTS_PER_FIXTURE, SCORERS_CACHE_TTL_SECONDS } from '@/config/gundemBot';
import { captureError } from '@/lib/logger';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { prisma } from '@/lib/prisma';
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { buildGoalDraft, fetchSeasonGoalScorers } from './goalDraft';
import { goalKindOf, sortEvents, type SeasonScorer } from './goalStanding';

export type TickSummary = {
  inplay: number;
  tracked: number;
  created: number;
  duplicates: number;
  skipped: number;
  staled: number;
  errors: number;
};

export type TickDeps = {
  fetchInplay: () => Promise<SportmonksFixture[]>;
  getScorers: (seasonId: number) => Promise<SeasonScorer[] | null>;
  now?: () => Date;
};

const INPLAY_INCLUDE = 'participants;league;events';

export async function fetchInplayFixtures(): Promise<SportmonksFixture[]> {
  return sportmonksCollectAllPages<SportmonksFixture>({
    basePath: 'football',
    path: '/livescores/inplay',
    perPage: 50,
    extraParams: { include: INPLAY_INCLUDE },
  });
}

function isScorerArray(v: unknown): v is SeasonScorer[] {
  return Array.isArray(v) && v.every((x) => x && typeof x.playerId === 'number' && typeof x.goals === 'number');
}

/** Sezon golcü tablosu, 30 dk önbellekli (Redis/in-memory). Başarısız/boş → null (istatistik cümlesi yazılmaz). */
export async function getScorersCached(seasonId: number): Promise<SeasonScorer[] | null> {
  const key = `gundem-bot:scorers:${seasonId}`;
  const cached = await readCache(key);
  if (isScorerArray(cached)) return cached;
  const fresh = await fetchSeasonGoalScorers(seasonId);
  if (fresh && fresh.length > 0) await writeCache(key, fresh, SCORERS_CACHE_TTL_SECONDS);
  return fresh;
}

/** Sportmonks `starting_at` ("YYYY-MM-DD HH:mm:ss", UTC) son 36 saat içinde mi — bayat/yanlış veriyi eler. */
export function startedRecently(startingAt: string | null | undefined, now: Date): boolean {
  if (!startingAt) return true; // bilinmiyorsa canlı (inplay) olduğuna güven
  const t = Date.parse(`${startingAt.replace(' ', 'T')}Z`);
  return Number.isNaN(t) || (now.getTime() - t < 36 * 3_600_000 && t - now.getTime() < 3_600_000);
}

type ExistingDraft = { id: string; fixtureId: number; eventId: number | null; status: string; facts: unknown };

function sameGoalSignature(facts: unknown, minute: number, extra: number | null, player: string): boolean {
  const f = facts as { minute?: number; extraMinute?: number | null; playerName?: string } | null;
  return !!f && f.minute === minute && (f.extraMinute ?? null) === extra && f.playerName === player;
}

export async function runBotTick(deps: TickDeps = { fetchInplay: fetchInplayFixtures, getScorers: getScorersCached }): Promise<TickSummary> {
  const now = deps.now?.() ?? new Date();
  const leagueIds = getBotLeagueIds();
  const summary: TickSummary = { inplay: 0, tracked: 0, created: 0, duplicates: 0, skipped: 0, staled: 0, errors: 0 };

  const inplay = await deps.fetchInplay();
  summary.inplay = inplay.length;
  const tracked = inplay.filter((f) => f.league_id != null && leagueIds.has(f.league_id) && startedRecently(f.starting_at, now));
  summary.tracked = tracked.length;
  if (tracked.length === 0) return summary;

  const existingRows = await prisma.gundemBotDraft.findMany({
    where: { fixtureId: { in: tracked.map((f) => f.id) } },
    select: { id: true, fixtureId: true, eventId: true, status: true, facts: true },
  });
  const byFixture = new Map<number, ExistingDraft[]>();
  for (const d of existingRows) byFixture.set(d.fixtureId, [...(byFixture.get(d.fixtureId) ?? []), d]);

  for (const fixture of tracked) {
    try {
      const events = fixture.events ?? [];
      const existing = byFixture.get(fixture.id) ?? [];
      const liveIds = new Set(events.map((e) => e.id));

      // VAR/iptal: olayı artık listede olmayan bekleyen taslaklar STALE (olay listesi boşsa veri hatası olabilir → dokunma).
      if (events.length > 0) {
        const gone = existing.filter((d) => d.status === 'PENDING' && d.eventId != null && !liveIds.has(d.eventId));
        if (gone.length > 0) {
          const res = await prisma.gundemBotDraft.updateMany({
            where: { id: { in: gone.map((d) => d.id) }, status: 'PENDING' },
            data: { status: 'STALE', decidedAt: now },
          });
          summary.staled += res.count;
        }
      }

      const goals = sortEvents(events.filter((e) => goalKindOf(e) !== null));
      const lastGoalId = goals[goals.length - 1]?.id;
      const seen = new Set(existing.map((d) => d.eventId));
      const fresh = goals.filter((g) => !seen.has(g.id));
      if (fresh.length === 0) continue;

      const scorers = fixture.season_id != null ? await deps.getScorers(fixture.season_id) : null;
      let made = 0;
      for (const goal of fresh) {
        if (made >= MAX_NEW_DRAFTS_PER_FIXTURE) {
          summary.skipped += 1;
          continue;
        }
        // Aynı golün yeniden verilen event id'si: (dakika, uzatma, oyuncu) imzası zaten taslaklarda varsa tekrar üretme.
        if (existing.some((d) => sameGoalSignature(d.facts, goal.minute, goal.extra_minute ?? null, (goal.player_name ?? '').trim()))) {
          summary.duplicates += 1;
          continue;
        }
        const draft = buildGoalDraft({ fixture, eventId: goal.id, scorers });
        if (!draft.ok) {
          summary.skipped += 1;
          continue;
        }
        const warnings = [...draft.warnings];
        if (goal.id !== lastGoalId) warnings.push('backlog: bu gol daha yeni bir golden önce atıldı (geç yakalandı olabilir)');
        try {
          await prisma.gundemBotDraft.create({
            data: {
              externalKey: draft.externalKey,
              kind: 'GOAL',
              fixtureId: fixture.id,
              eventId: goal.id,
              body: draft.body,
              facts: draft.facts as unknown as Prisma.InputJsonValue,
              warnings,
            },
          });
          made += 1;
          summary.created += 1;
          existing.push({ id: draft.externalKey, fixtureId: fixture.id, eventId: goal.id, status: 'PENDING', facts: draft.facts });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002') summary.duplicates += 1; // eşzamanlı tick: unique = tek kez işleme
          else throw e;
        }
      }
    } catch (e) {
      summary.errors += 1;
      captureError('gundem:bot-tick', e);
    }
  }
  return summary;
}
