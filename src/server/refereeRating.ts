/**
 * Hakem puanlama — DB tarafı (kurallar ve SQL: lib/refereeRating.ts). Puan yazımında hakem kimliği, maç etiketi ve
 * "bitti mi / süre doldu mu" kararı SUNUCUDA maçtan çıkar: maç sayfasının paylaşımlı `fixtures/{id}` önbelleği
 * (`findMatchById`; sayfa az önce yüklendiyse Redis'ten, ek Sportmonks isteği yok).
 */
import type { Match } from '@/models/liveScore';
import { prisma } from '@/lib/prisma';
import { findMatchById } from '@/services/liveScoreService';
import { matchKickoffMs } from '@/utils/matchActivity';
import {
  matchAggregateSql,
  refereeAggregateSql,
  refereeRecentSql,
  refereeRatingWindow,
  toAggregate,
  toRecent,
  type RatingAggregate,
  type RefereeFanRating,
  type RefereeRatingWindow,
  type SqlQuery,
} from '@/lib/refereeRating';

type Raw = <T>(q: SqlQuery) => Promise<T[]>;
const raw: Raw = <T,>(q: SqlQuery) => prisma.$queryRawUnsafe<T[]>(q.text, ...q.values);

export async function loadMatchRatingAggregate(matchId: string, run: Raw = raw): Promise<RatingAggregate> {
  return toAggregate(await run(matchAggregateSql(matchId)));
}

export async function loadUserMatchRating(userId: string, matchId: string): Promise<number | null> {
  const row = await prisma.refereeRating.findUnique({ where: { userId_matchId: { userId, matchId } }, select: { score: true } });
  return row?.score ?? null;
}

export async function loadRefereeFanRating(refereeId: number, run: Raw = raw): Promise<RefereeFanRating> {
  const [agg, recent] = await Promise.all([run(refereeAggregateSql(refereeId)), run(refereeRecentSql(refereeId))]);
  return { ...toAggregate(agg as never[]), recent: toRecent(recent as never[]) };
}

export type RatingTarget =
  | { ok: true; refereeId: number; homeName: string; awayName: string; kickoffAt: Date }
  | { ok: false; reason: RefereeRatingWindow | 'missing' | 'unavailable' };

/** Maçı çözüp puanlanabilirliğe karar verir. `loadMatch` testte taklit edilir. */
export async function resolveRatingTarget(
  matchId: string,
  now: number = Date.now(),
  loadMatch: (id: string) => Promise<{ match: Match | null; transient?: boolean }> = findMatchById,
): Promise<RatingTarget> {
  if (!/^\d{1,12}$/.test(matchId)) return { ok: false, reason: 'missing' };
  let res: { match: Match | null; transient?: boolean };
  try {
    res = await loadMatch(matchId);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const m = res.match;
  if (!m) return { ok: false, reason: res.transient ? 'unavailable' : 'missing' };
  const w = refereeRatingWindow(m, now);
  if (w !== 'open') return { ok: false, reason: w };
  return {
    ok: true,
    refereeId: m.referee_id!,
    homeName: (m.home?.name || m.home_name || '').slice(0, 120),
    awayName: (m.away?.name || m.away_name || '').slice(0, 120),
    kickoffAt: new Date(matchKickoffMs(m)!),
  };
}

export async function saveRefereeRating(
  userId: string,
  matchId: string,
  score: number,
  target: Extract<RatingTarget, { ok: true }>,
): Promise<void> {
  const data = { score, refereeId: target.refereeId, homeName: target.homeName, awayName: target.awayName, kickoffAt: target.kickoffAt };
  await prisma.refereeRating.upsert({
    where: { userId_matchId: { userId, matchId } },
    update: data,
    create: { userId, matchId, ...data },
  });
}
