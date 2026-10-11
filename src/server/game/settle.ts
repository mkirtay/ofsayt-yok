/**
 * Tahmin oyunu sonuç işi (`game-settle`; cron-job.org 10 dk + Vercel günlük yedek, admin elle). Plan §5.2.
 *
 * Kota: YENİ Sportmonks istek türü yok. Maç sonucu, ana sayfanın paylaşımlı cache'teki `fixtures/date/{d}` listesinden
 * (maçın UTC günü) okunur; yalnız başlamaya 3 sa kala ve sonrası. Listede bulunamazsa başlama +4 sa'ten sonra saatte en
 * çok bir `fixtures/{id}` (mevcut `resolveSportmonksMatch`, negatif cache'li). İzlenecek maç yoksa hiçbir dış istek yok.
 * Fixture havuzu 429 soğumasındaysa liste boş döner → karar "bekle" (kayıt kapatılmaz; +3 gün kuralı yine geçerli).
 *
 * Puanlama idempotent: aynı maç yeniden puanlanırsa sonuç aynı (admin "sonucu düzelt" de bunu kullanır).
 */
import type { GameMatch, GameWeek, Prisma } from '@prisma/client';
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
import { invalidateLeaderboards } from '@/server/game/play';

export type SettleDeps = {
  now?: () => Date;
  /** Paylaşımlı cache'li gün listesi (UTC günü). */
  fixturesForUtcDate?: (isoDate: string) => Promise<Match[]>;
  /** Yedek: tek maç (`fixtures/{id}`). */
  lookupFixture?: (fixtureId: string) => Promise<Match | null>;
};

export type SettleSummary = { evaluated: number; voided: number; kickoffUpdates: number; fallbacks: number; closedWeeks: number; errors: number };

const defaultLookup = async (fixtureId: string): Promise<Match | null> => {
  const r = await resolveSportmonksMatch(fixtureId);
  return r.kind === 'found' ? r.match : null;
};

type Tx = Prisma.TransactionClient;
const rawTx = <T>(tx: Tx, q: SqlQuery) => tx.$queryRawUnsafe<T[]>(q.text, ...q.values);

const CHUNK = 1000;

/** Maçı verilen normal süre skoruyla puanlar (dağılım + nadir + joker), haftanın toplamlarını yeniden hesaplar. */
export async function finishMatch(m: Pick<GameMatch, 'id' | 'weekId'>, home: number, away: number, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const distRows = await rawTx<{ home: number; away: number; n: number }>(tx, distributionRowsSql(m.id));
      const dist: Distribution = buildDistribution(distRows.flatMap((r) => Array.from({ length: Number(r.n) }, () => ({ home: r.home, away: r.away }))));
      const actual = { home, away };
      const rare = isRareScore(actual, dist);
      const rows = await rawTx<ScoringRow>(tx, predictionsForScoringSql(m.id));
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK).map((r) => ({ id: r.id, ...scorePrediction(r, actual, { rare, joker: !!r.joker }) }));
        await rawTx(tx, applyPointsSql(part.map((p) => p.id), part.map((p) => p.points), part.map((p) => JSON.stringify(p.breakdown))));
      }
      await tx.gameMatch.update({
        where: { id: m.id },
        data: { status: 'FINISHED', homeGoals: home, awayGoals: away, distribution: dist as unknown as Prisma.InputJsonValue, settledAt: now, voidReason: null },
      });
      await rawTx(tx, recomputeEntriesSql(m.weekId));
    },
    { timeout: 60_000 },
  );
}

/** Maçı iptal eder: tahminler 0, joker yanar, toplamlar yeniden hesaplanır. */
export async function voidMatch(m: Pick<GameMatch, 'id' | 'weekId'>, reason: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await rawTx(tx, voidPointsSql(m.id));
    await tx.gameMatch.update({ where: { id: m.id }, data: { status: 'VOID', voidReason: reason.slice(0, 40), settledAt: now, homeGoals: null, awayGoals: null } });
    await rawTx(tx, recomputeEntriesSql(m.weekId));
  });
}

/** Tüm maçları sonuçlanan yayındaki haftaları kapatır. */
async function closeFinishedWeeks(now: Date): Promise<GameWeek[]> {
  const open = await prisma.gameWeek.findMany({ where: { status: 'PUBLISHED', matches: { some: {}, none: { status: 'SCHEDULED' } } } });
  for (const w of open) await prisma.gameWeek.update({ where: { id: w.id }, data: { status: 'SETTLED', settledAt: now } });
  return open;
}

export async function settleGameMatches(deps: SettleDeps = {}): Promise<SettleSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const listFor = deps.fixturesForUtcDate ?? getFixturesByDate;
  const lookup = deps.lookupFixture ?? defaultLookup;
  const summary: SettleSummary = { evaluated: 0, voided: 0, kickoffUpdates: 0, fallbacks: 0, closedWeeks: 0, errors: 0 };

  const matches = await prisma.gameMatch.findMany({
    where: { status: 'SCHEDULED', week: { status: 'PUBLISHED' } },
    include: { week: { select: { weekKey: true, season: true, startsAt: true, endsAt: true } } },
  });
  const due = matches.filter((m) => needsProviderCheck(m.kickoffAt, now));
  const touchedWeeks = new Map<string, { weekKey: string; season: string }>();

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
      const input = { kickoffAt: m.kickoffAt, weekStartsAt: m.week.startsAt, weekEndsAt: m.week.endsAt, checkedAt: m.checkedAt, now };
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
      if (decision.kind === 'finish' || decision.kind === 'void') touchedWeeks.set(m.weekId, m.week);
    } catch (e) {
      summary.errors += 1;
      captureError('game-settle:match', e);
    }
  }

  const closed = await closeFinishedWeeks(now);
  summary.closedWeeks = closed.length;
  for (const w of closed) touchedWeeks.set(w.id, w);
  await Promise.all([...touchedWeeks.values()].map((w) => invalidateLeaderboards(w.weekKey, w.season)));
  return summary;
}
