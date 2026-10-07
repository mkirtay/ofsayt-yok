/**
 * Frikik skor tablosu — DB erişimi. Herkese açık tablo (günün / ayın en iyi 20'si) Redis'te 30 sn önbellekli
 * (anahtar ortam önekli; kişisel veri yok: yalnız takma ad + seviye + puan + gün). Kişisel sıra her zaman DB'den.
 * Sıralama SQL'leri lib/frikik/leaderboard.ts'te (PGlite testiyle aynı metin).
 */
import { Prisma } from '@prisma/client';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { monthKey } from '@/lib/frikik/daily';
import {
  dailyRankSql,
  dailyTopSql,
  monthlyRankSql,
  monthlyTopSql,
  myMonthBestSql,
  type LeaderboardRow,
  type RunKey,
  type SqlQuery,
} from '@/lib/frikik/leaderboard';
import type { VerifiedRun } from '@/lib/frikik/scoreSubmit';
import { SIM_VERSION } from '@/lib/frikik/sim';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { prisma } from '@/lib/prisma';

export const LEADERBOARD_CACHE_SECONDS = 30;

/** Tabloda gösterilen satır (JSON; tarih yok, kimlik yok). */
export type BoardEntry = { rank: number; nickname: string; level: number; score: number; day: string };
export type Leaderboard = { day: string; month: string; daily: BoardEntry[]; monthly: BoardEntry[] };

/** Kullanıcının kendi durumu. */
export type MyStanding = {
  day: string;
  month: string;
  nickname: string | null;
  /** Bugünkü kaydı (yoksa null → bugün henüz tabloya yazmadı). */
  today: { level: number; score: number; cleared: number; rank: number } | null;
  /** Ay içindeki en iyi günlük kaydı ve aylık sırası. */
  month_best: { level: number; score: number; day: string; rank: number } | null;
};

const raw = <T>(q: SqlQuery) => prisma.$queryRawUnsafe<T[]>(q.text, ...q.values);

function toEntries(rows: LeaderboardRow[]): BoardEntry[] {
  return rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname ?? '—', level: r.level, score: r.score, day: r.day }));
}

export async function loadLeaderboard(day: string): Promise<Leaderboard> {
  const month = monthKey(day);
  const key = `${cacheKeyPrefix()}frikik:lb:v1:${day}`;
  const cached = (await readCache(key)) as Leaderboard | null;
  if (cached) return cached;
  const [daily, monthly] = await Promise.all([raw<LeaderboardRow>(dailyTopSql(day)), raw<LeaderboardRow>(monthlyTopSql(month))]);
  const board: Leaderboard = { day, month, daily: toEntries(daily), monthly: toEntries(monthly) };
  await writeCache(key, board, LEADERBOARD_CACHE_SECONDS);
  return board;
}

async function rankOf(q: SqlQuery): Promise<number> {
  const rows = await raw<{ n: number }>(q);
  return Number(rows[0]?.n ?? 0) + 1;
}

export async function loadMyStanding(userId: string, day: string): Promise<MyStanding> {
  const month = monthKey(day);
  const [user, todayRow, bestRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    prisma.frikikDailyScore.findUnique({ where: { userId_day: { userId, day } }, select: { level: true, score: true, cleared: true, createdAt: true } }),
    raw<LeaderboardRow>(myMonthBestSql(userId, month)),
  ]);
  const best = bestRows[0] ?? null;
  const [dayRank, monthRank] = await Promise.all([
    todayRow ? rankOf(dailyRankSql(day, todayRow)) : null,
    best ? rankOf(monthlyRankSql(month, best as RunKey)) : null,
  ]);
  return {
    day,
    month,
    nickname: user?.username ?? null,
    today: todayRow && dayRank ? { level: todayRow.level, score: todayRow.score, cleared: todayRow.cleared, rank: dayRank } : null,
    month_best: best && monthRank ? { level: best.level, score: best.score, day: best.day, rank: monthRank } : null,
  };
}

export type SubmitOutcome = { recorded: boolean; standing: MyStanding };

/** Günün ilk bitmiş koşusu yazılır; aynı gün ikinci gönderim (tekil anahtar) mevcut kaydı döner (recorded=false). */
export async function submitVerifiedRun(userId: string, run: VerifiedRun): Promise<SubmitOutcome> {
  let recorded = true;
  try {
    await prisma.frikikDailyScore.create({
      data: {
        userId,
        day: run.day,
        month: monthKey(run.day),
        score: run.score,
        level: run.level,
        cleared: run.cleared,
        simVersion: SIM_VERSION,
        seed: run.seed,
        shots: run.shots,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') recorded = false;
    else throw e;
  }
  return { recorded, standing: await loadMyStanding(userId, run.day) };
}
