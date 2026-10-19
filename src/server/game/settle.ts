/**
 * Tahmin oyunu sonuç işi (`game-settle`; cron-job.org 10 dk + Vercel günlük yedek, admin elle). Plan §5.2.
 *
 * Kota: YENİ Sportmonks istek türü yok. Maç sonucu, ana sayfanın paylaşımlı cache'teki `fixtures/date/{d}` listesinden
 * (maçın UTC günü) okunur; yalnız başlamaya 3 sa kala ve sonrası. Listede bulunamazsa başlama +4 sa'ten sonra saatte en
 * çok bir `fixtures/{id}` (mevcut `resolveSportmonksMatch`, negatif cache'li). İzlenecek maç yoksa (ve günlük oyun açıksa) hiçbir dış istek yok.
 * Fixture havuzu 429 soğumasındaysa liste boş döner → karar "bekle" (kayıt kapatılmaz; +3 gün kuralı yine geçerli).
 *
 * Puanlama idempotent: aynı maç yeniden puanlanırsa sonuç aynı (admin "sonucu düzelt" de bunu kullanır). Maç hem haftalık hem
 * günlük listedeyse tek kez puanlanır: `points` haftalık (joker dahil), `basePoints` günlük (jokersiz).
 *
 * Günlük oyun: her tur önce bugünün "Günün 3 maçı"nı garanti eder (server/game/days.ts → ensureDailyRound), sonra maçları
 * izler; tüm maçları sonuçlanan günü kapatır.
 */
import type { GameDay, GameMatch, GameWeek, Prisma } from '@prisma/client';
import type { Match } from '@/models/liveScore';
import { captureError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { resolveSportmonksMatch } from '@/lib/resolveLiveMatch';
import { getFixturesByDate } from '@/services/liveScoreService';
import { buildDistribution, isRareScore, scorePrediction, type Distribution } from '@/lib/game/scoring';
import { decideMatch, needsProviderCheck, type Decision } from '@/lib/game/settleDecision';
import {
  applyPointsSql,
  distributionRowsSql,
  predictionsForScoringSql,
  recomputeEntriesSql,
  voidPointsSql,
  type ScoringRow,
  type SqlQuery,
} from '@/lib/game/sql';
import { invalidateDayLeaderboard, invalidateLeaderboards } from '@/server/game/play';
import { ensureDailyRound, todayKey } from '@/server/game/days';

export type SettleDeps = {
  now?: () => Date;
  /** Paylaşımlı cache'li gün listesi (UTC günü). */
  fixturesForUtcDate?: (isoDate: string) => Promise<Match[]>;
  /** Yedek: tek maç (`fixtures/{id}`). */
  lookupFixture?: (fixtureId: string) => Promise<Match | null>;
};

export type SettleSummary = {
  evaluated: number;
  voided: number;
  kickoffUpdates: number;
  fallbacks: number;
  closedWeeks: number;
  closedDays: number;
  /** Bu turda günlük oyun açıldı mı (1/0; mevcutsa 0). */
  dayCreated: number;
  errors: number;
};

const defaultLookup = async (fixtureId: string): Promise<Match | null> => {
  const r = await resolveSportmonksMatch(fixtureId);
  return r.kind === 'found' ? r.match : null;
};

type Tx = Prisma.TransactionClient;
const rawTx = <T>(tx: Tx, q: SqlQuery) => tx.$queryRawUnsafe<T[]>(q.text, ...q.values);

const CHUNK = 1000;

/** Maçı verilen normal süre skoruyla puanlar (dağılım + nadir + joker), haftanın toplamlarını yeniden hesaplar (günlük sıralama tahminlerden okunur). */
export async function finishMatch(m: Pick<GameMatch, 'id' | 'weekId'>, home: number, away: number, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const distRows = await rawTx<{ home: number; away: number; n: number }>(tx, distributionRowsSql(m.id));
      const dist: Distribution = buildDistribution(distRows.flatMap((r) => Array.from({ length: Number(r.n) }, () => ({ home: r.home, away: r.away }))));
      const actual = { home, away };
      const rare = isRareScore(actual, dist);
      const rows = await rawTx<ScoringRow>(tx, predictionsForScoringSql(m.id));
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK).map((r) => {
          const scored = scorePrediction(r, actual, { rare, joker: !!r.joker });
          // Günlük puan jokersiz: kırılımdaki parçaların toplamı.
          const b = scored.breakdown;
          return { id: r.id, ...scored, base: b.dir + b.diff + b.total + b.exact + b.rare };
        });
        await rawTx(
          tx,
          applyPointsSql(
            part.map((p) => p.id),
            part.map((p) => p.points),
            part.map((p) => p.base),
            part.map((p) => JSON.stringify(p.breakdown)),
          ),
        );
      }
      await tx.gameMatch.update({
        where: { id: m.id },
        data: { status: 'FINISHED', homeGoals: home, awayGoals: away, distribution: dist as unknown as Prisma.InputJsonValue, settledAt: now, voidReason: null },
      });
      if (m.weekId) await rawTx(tx, recomputeEntriesSql(m.weekId));
    },
    { timeout: 60_000 },
  );
}

/** Maçı iptal eder: tahminler 0, joker yanar, toplamlar yeniden hesaplanır. */
export async function voidMatch(m: Pick<GameMatch, 'id' | 'weekId'>, reason: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await rawTx(tx, voidPointsSql(m.id));
    await tx.gameMatch.update({ where: { id: m.id }, data: { status: 'VOID', voidReason: reason.slice(0, 40), settledAt: now, homeGoals: null, awayGoals: null } });
    if (m.weekId) await rawTx(tx, recomputeEntriesSql(m.weekId));
  });
}

/** Tüm maçları sonuçlanan yayındaki haftaları kapatır. */
async function closeFinishedWeeks(now: Date): Promise<GameWeek[]> {
  const open = await prisma.gameWeek.findMany({ where: { status: 'PUBLISHED', matches: { some: {}, none: { status: 'SCHEDULED' } } } });
  for (const w of open) await prisma.gameWeek.update({ where: { id: w.id }, data: { status: 'SETTLED', settledAt: now } });
  return open;
}

/** Tüm maçları sonuçlanan yayındaki günleri kapatır. */
async function closeFinishedDays(now: Date): Promise<GameDay[]> {
  const open = await prisma.gameDay.findMany({ where: { status: 'PUBLISHED', matches: { some: {}, none: { status: 'SCHEDULED' } } } });
  for (const d of open) await prisma.gameDay.update({ where: { id: d.id }, data: { status: 'SETTLED', settledAt: now } });
  return open;
}

export async function settleGameMatches(deps: SettleDeps = {}): Promise<SettleSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const listFor = deps.fixturesForUtcDate ?? getFixturesByDate;
  const lookup = deps.lookupFixture ?? defaultLookup;
  const summary: SettleSummary = { evaluated: 0, voided: 0, kickoffUpdates: 0, fallbacks: 0, closedWeeks: 0, closedDays: 0, dayCreated: 0, errors: 0 };

  try {
    const before = await prisma.gameDay.count({ where: { dayKey: todayKey(now) } });
    const day = await ensureDailyRound({ now, fixturesForUtcDate: listFor });
    summary.dayCreated = !before && day ? 1 : 0;
  } catch (e) {
    summary.errors += 1;
    captureError('game-settle:daily', e);
  }

  const matches = await prisma.gameMatch.findMany({
    where: { status: 'SCHEDULED', OR: [{ week: { status: 'PUBLISHED' } }, { day: { status: 'PUBLISHED' } }] },
    include: { week: { select: { weekKey: true, season: true, startsAt: true, endsAt: true } }, day: { select: { dayKey: true, startsAt: true, endsAt: true } } },
  });
  const due = matches.filter((m) => needsProviderCheck(m.kickoffAt, now));
  const touchedWeeks = new Map<string, { weekKey: string; season: string }>();
  const touchedDays = new Set<string>();

  // Gün listeleri: maçın UTC günü (ana sayfayla aynı cache anahtarı). Gün başına bir okuma.
  const lists = new Map<string, Map<string, Match>>();
  for (const day of new Set(due.map((m) => m.kickoffAt.toISOString().slice(0, 10)))) {
    try {
      const rows = await listFor(day);
      lists.set(day, new Map(rows.map((r) => [String(r.id), r])));
    } catch (e) {
      captureError('game-settle:list', e);
      lists.set(day, new Map());
    }
  }

  for (const m of due) {
    try {
      // Erteleme penceresi: haftalık listedeyse hafta (çakışmada da), yalnız günlükse o gün.
      const window = m.week ?? m.day!;
      const input = { kickoffAt: m.kickoffAt, weekStartsAt: window.startsAt, weekEndsAt: window.endsAt, checkedAt: m.checkedAt, now };
      let decision: Decision = decideMatch(input, lists.get(m.kickoffAt.toISOString().slice(0, 10))?.get(m.fixtureId) ?? null);
      if (decision.kind === 'fallback') {
        summary.fallbacks += 1;
        await prisma.gameMatch.update({ where: { id: m.id }, data: { checkedAt: now } });
        decision = decideMatch(input, await lookup(m.fixtureId), true);
      }
      if (decision.kind === 'finish') {
        await finishMatch(m, decision.home, decision.away, now);
        summary.evaluated += 1;
      } else if (decision.kind === 'void') {
        await voidMatch(m, decision.reason, now);
        summary.voided += 1;
      } else if (decision.kind === 'kickoff') {
        await prisma.gameMatch.update({ where: { id: m.id }, data: { kickoffAt: decision.at } });
        summary.kickoffUpdates += 1;
      }
      if (decision.kind === 'finish' || decision.kind === 'void') {
        if (m.weekId && m.week) touchedWeeks.set(m.weekId, m.week);
        if (m.day) touchedDays.add(m.day.dayKey);
      }
    } catch (e) {
      summary.errors += 1;
      captureError('game-settle:match', e);
    }
  }

  const closed = await closeFinishedWeeks(now);
  summary.closedWeeks = closed.length;
  for (const w of closed) touchedWeeks.set(w.id, w);
  const closedDays = await closeFinishedDays(now);
  summary.closedDays = closedDays.length;
  for (const d of closedDays) touchedDays.add(d.dayKey);
  await Promise.all([
    ...[...touchedWeeks.values()].map((w) => invalidateLeaderboards(w.weekKey, w.season)),
    ...[...touchedDays].map((k) => invalidateDayLeaderboard(k)),
  ]);
  return summary;
}
