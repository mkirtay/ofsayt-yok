/**
 * Kredi teşvikleri — DB tarafı (kurallar lib/rewards.ts). İki giriş:
 * - Başlangıç görevleri: `loadOnboardingTasks` (durum) + `claimOnboardingTask` (kullanıcı "Al" der; iş DB'den doğrulanır).
 * - Dönem ödülleri: `grantPeriodicRewards` — game-settle cron'unun sonunda (10 dk) çalışır; bitmiş tahmin oyunu
 *   haftalarını ve Frikik aylarını tarar. İdempotent: her ödül `(userId, idempotencyKey)` tekil anahtarıyla bir kez.
 *
 * Bu modül kredi EKLER, asla düşmez; tahmin/oyun kodu kredi düşmez (creditPolicy.test.ts).
 */
import { Prisma } from '@prisma/client';
import { isUniqueViolation } from '@/lib/credits';
import { activeInMonthSql, monthlyTopSql } from '@/lib/frikik/leaderboard';
import { monthKey, todayKey } from '@/lib/frikik/daily';
import { weekTopSql, type BoardRow } from '@/lib/game/sql';
import { captureError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  FRIKIK_MONTH_ACTIVE_DAYS,
  ONBOARDING_REWARD,
  ONBOARDING_TASKS,
  REWARDS_LOOKBACK_DAYS,
  finishedRewardMonths,
  isRewardWeek,
  onboardingKey,
  planMonthRewards,
  planWeekRewards,
  type OnboardingTask,
  type PlannedReward,
  type RewardType,
} from '@/lib/rewards';

type SqlQuery = { text: string; values: unknown[] };
const raw = <T>(q: SqlQuery) => prisma.$queryRawUnsafe<T[]>(q.text, ...q.values);

export type GrantResult = 'granted' | 'duplicate' | 'unverified';

/**
 * Tek ödül: doğrulanmış e-posta şartı + atomik artırma + tekrar anahtarlı defter satırı (aynı işlemde). Eşzamanlı ikinci
 * çağrı tekil anahtarda düşer ve artırma dahil geri alınır.
 */
export async function grantReward(r: PlannedReward, type: RewardType): Promise<{ result: GrantResult; balance?: number }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const me = await tx.user.findUnique({ where: { id: r.userId }, select: { emailVerified: true } });
      if (!me?.emailVerified) return { result: 'unverified' as const };
      // Ön kontrol (olağan yol): tekil ihlali işlemi düşürmesin. Eşzamanlı yarışta ikinci yazım yine tekil anahtarda düşer.
      const prior = await tx.creditTransaction.findUnique({ where: { userId_idempotencyKey: { userId: r.userId, idempotencyKey: r.key } }, select: { id: true } });
      if (prior) return { result: 'duplicate' as const };
      const user = await tx.user.update({ where: { id: r.userId }, data: { credits: { increment: r.amount } }, select: { credits: true } });
      await tx.creditTransaction.create({
        data: { userId: r.userId, type, amount: r.amount, balanceAfter: user.credits, idempotencyKey: r.key, note: r.note },
      });
      return { result: 'granted' as const, balance: user.credits };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { result: 'duplicate' };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return { result: 'unverified' };
    throw err;
  }
}

/** Planı uygular; daha önce verilmiş olanları tek sorguyla eler (her 10 dk'da yeniden denemek ucuz olsun). */
async function grantAll(plan: PlannedReward[], type: RewardType): Promise<number> {
  if (plan.length === 0) return 0;
  const done = await prisma.creditTransaction.findMany({
    where: { userId: { in: [...new Set(plan.map((p) => p.userId))] }, idempotencyKey: { in: [...new Set(plan.map((p) => p.key))] } },
    select: { userId: true, idempotencyKey: true },
  });
  const seen = new Set(done.map((d) => `${d.userId}|${d.idempotencyKey}`));
  let granted = 0;
  for (const p of plan) {
    if (seen.has(`${p.userId}|${p.key}`)) continue;
    if ((await grantReward(p, type)).result === 'granted') granted += 1;
  }
  return granted;
}

// ── Başlangıç görevleri ──────────────────────────────────────────────────────────────────────────────────────────────

export type OnboardingStatus = {
  verified: boolean;
  tasks: { id: OnboardingTask; done: boolean; claimed: boolean; reward: number }[];
};

async function completedTasks(userId: string): Promise<Set<OnboardingTask>> {
  const [analysis, prediction, post, comment, frikik] = await Promise.all([
    prisma.analysisUnlock.findFirst({ where: { userId }, select: { id: true } }),
    prisma.gamePrediction.findFirst({ where: { userId }, select: { id: true } }),
    prisma.post.findFirst({ where: { authorId: userId, authorType: 'USER', deletedAt: null }, select: { id: true } }),
    prisma.postComment.findFirst({ where: { userId, deletedAt: null }, select: { id: true } }),
    prisma.frikikDailyScore.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  const done = new Set<OnboardingTask>();
  if (analysis) done.add('analysis');
  if (prediction) done.add('prediction');
  if (post || comment) done.add('gundem');
  if (frikik) done.add('frikik');
  return done;
}

export async function loadOnboardingTasks(userId: string): Promise<OnboardingStatus> {
  const [user, done, claimedRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } }),
    completedTasks(userId),
    prisma.creditTransaction.findMany({
      where: { userId, idempotencyKey: { in: ONBOARDING_TASKS.map(onboardingKey) } },
      select: { idempotencyKey: true },
    }),
  ]);
  const claimed = new Set(claimedRows.map((r) => r.idempotencyKey));
  return {
    verified: !!user?.emailVerified,
    tasks: ONBOARDING_TASKS.map((id) => ({ id, done: done.has(id), claimed: claimed.has(onboardingKey(id)), reward: ONBOARDING_REWARD })),
  };
}

export type ClaimOutcome = { ok: true; balance: number } | { ok: false; code: 'NOT_DONE' | 'ALREADY_CLAIMED' | 'UNVERIFIED' };

const TASK_NOTES: Record<OnboardingTask, string> = {
  analysis: 'Başlangıç görevi: ilk AI analizi',
  prediction: 'Başlangıç görevi: ilk skor tahmini',
  gundem: 'Başlangıç görevi: ilk Gündem paylaşımı',
  frikik: 'Başlangıç görevi: ilk Frikik koşusu',
};

export async function claimOnboardingTask(userId: string, task: OnboardingTask): Promise<ClaimOutcome> {
  if (!(await completedTasks(userId)).has(task)) return { ok: false, code: 'NOT_DONE' };
  const r = await grantReward({ userId, amount: ONBOARDING_REWARD, key: onboardingKey(task), note: TASK_NOTES[task] }, 'ONBOARDING_REWARD');
  if (r.result === 'granted') return { ok: true, balance: r.balance! };
  return { ok: false, code: r.result === 'duplicate' ? 'ALREADY_CLAIMED' : 'UNVERIFIED' };
}

// ── Dönem ödülleri (cron) ────────────────────────────────────────────────────────────────────────────────────────────

/** Tablonun tamamı (ödül hesabı için; görünür tablo 50 ile sınırlı). */
const WEEK_ROWS_LIMIT = 100_000;

export type PeriodicSummary = { weeks: number; months: number; granted: number };

export async function grantPeriodicRewards(now: Date = new Date()): Promise<PeriodicSummary> {
  const summary: PeriodicSummary = { weeks: 0, months: 0, granted: 0 };
  const since = new Date(now.getTime() - REWARDS_LOOKBACK_DAYS * 86_400_000);

  const weeks = await prisma.gameWeek.findMany({
    where: { status: 'SETTLED', settledAt: { gte: since } },
    select: { id: true, weekKey: true, _count: { select: { matches: true } } },
  });
  for (const w of weeks) {
    if (!isRewardWeek(w.weekKey)) continue;
    try {
      const rows = await raw<BoardRow>(weekTopSql(w.id, WEEK_ROWS_LIMIT));
      const plan = planWeekRewards(
        w.weekKey,
        rows.map((r) => ({ userId: r.userId, points: Number(r.points), picks: Number(r.picks) })),
        w._count.matches,
      );
      summary.granted += await grantAll(plan, 'GAME_REWARD');
      summary.weeks += 1;
    } catch (e) {
      captureError('rewards:game-week', e);
    }
  }

  for (const month of finishedRewardMonths(monthKey(todayKey(now.getTime())))) {
    try {
      const [top, active] = await Promise.all([
        raw<{ userId: string }>(monthlyTopSql(month, 3)),
        raw<{ userId: string }>(activeInMonthSql(month, FRIKIK_MONTH_ACTIVE_DAYS)),
      ]);
      summary.granted += await grantAll(planMonthRewards(month, top, active), 'FRIKIK_REWARD');
      summary.months += 1;
    } catch (e) {
      captureError('rewards:frikik-month', e);
    }
  }
  return summary;
}
