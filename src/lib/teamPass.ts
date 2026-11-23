/**
 * "Takımım" sezon paketi (büyüme raporu 2.8; karar 2026-11-22: TL değil KREDİ ile). Bir Süper Lig takımı için bu
 * sezonun hazır AI analizleri (ön üretim Süper Lig'in tamamını ve Türk takımlarının Avrupa maçlarını kapsar,
 * server/analysisPregen.ts) kilitsiz açılır. Tek seferlik: abonelik yok, yenileme yok; sezon bitince geçersiz.
 *
 * Fiyat: TEAM_PASS_COST (varsayılan 10 kredi = 10'luk paket; bir takımın sezonda ~40 analizi).
 * Ödeme yok → Hikie / mesafeli satış değişikliği gerekmez; yalnız yeni bir kredi harcama türü (TEAM_PASS).
 */
import { prisma } from '@/lib/prisma';
import { InsufficientCreditsError, isUniqueViolation } from '@/lib/credits';
import { todayIsoIstanbul } from '@/utils/dateStrip';

export const DEFAULT_TEAM_PASS_COST = 10;

export function teamPassCost(): number {
  const n = Number(process.env.TEAM_PASS_COST);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TEAM_PASS_COST;
}

/** Futbol sezonu (TSİ): 1 Temmuz'dan itibaren yeni sezon. 2026-11-22 → "2026-27". */
export function passSeason(now: number = Date.now()): string {
  const [y, m] = todayIsoIstanbul(new Date(now)).split('-').map(Number) as [number, number];
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export class TeamPassOwnedError extends Error {
  constructor() {
    super('Bu takımın sezon paketi zaten sende.');
    this.name = 'TeamPassOwnedError';
  }
}

/** Paketi al: kredi düşer (tek işlem), defter + paket satırı; aynı sezon/takım ikinci kez → TeamPassOwnedError. */
export async function buyTeamPass(
  userId: string,
  team: { id: number; name: string },
  now: number = Date.now(),
): Promise<{ season: string; balanceAfter: number; cost: number }> {
  const season = passSeason(now);
  const cost = teamPassCost();
  const owned = await prisma.teamPass.findUnique({ where: { userId_teamId_season: { userId, teamId: team.id, season } }, select: { id: true } });
  if (owned) throw new TeamPassOwnedError();
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id: userId, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
      if (count === 0) throw new InsufficientCreditsError();
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const balanceAfter = user?.credits ?? 0;
      const spend = await tx.creditTransaction.create({
        data: {
          userId,
          type: 'TEAM_PASS',
          amount: -cost,
          balanceAfter,
          idempotencyKey: `team-pass:${season}:${team.id}`,
          status: 'SETTLED',
          note: `Takımım sezon paketi: ${team.name} (${season})`,
        },
        select: { id: true },
      });
      await tx.teamPass.create({ data: { userId, teamId: team.id, teamName: team.name, season, creditTransactionId: spend.id } });
      return { season, balanceAfter, cost };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new TeamPassOwnedError();
    throw e;
  }
}

/** Bu sezon iki takımdan birinin paketi var mı (analiz kilidi). */
export async function teamPassCovers(userId: string, teamIds: ReadonlyArray<number | string | null | undefined>, now: number = Date.now()): Promise<boolean> {
  const ids = teamIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return false;
  const row = await prisma.teamPass.findFirst({ where: { userId, season: passSeason(now), teamId: { in: ids } }, select: { id: true } });
  return !!row;
}

export async function myTeamPasses(userId: string, now: number = Date.now()): Promise<{ teamId: number; teamName: string; season: string }[]> {
  return prisma.teamPass.findMany({ where: { userId, season: passSeason(now) }, select: { teamId: true, teamName: true, season: true }, orderBy: { createdAt: 'asc' } });
}

/** Paketle açılış kaydı (ek ücret yok; "Analizlerim"de görünsün). Zaten açıksa aynen döner. */
export async function recordTeamPassUnlock(userId: string, analysis: { id: string; matchId: string }): Promise<void> {
  const existing = await prisma.analysisUnlock.findUnique({ where: { userId_matchAnalysisId: { userId, matchAnalysisId: analysis.id } }, select: { id: true } });
  if (existing) return;
  try {
    await prisma.analysisUnlock.create({ data: { userId, matchAnalysisId: analysis.id, matchId: analysis.matchId, source: 'TEAM_PASS' } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
}
