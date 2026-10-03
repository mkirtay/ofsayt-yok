/**
 * Kredi modeli v2 — AI analizini AÇMA (kullanıcı başına, kalıcı). Erişimin tek kaydı `AnalysisUnlock`.
 *
 * - Hazır analiz: tek işlemde koşullu düşüm (`credits >= 1`) + defter `ANALYSIS_SPEND` −1 SETTLED (tekrar anahtarı
 *   `analysis:{matchId}:PRE`, 106f818 ile aynı) + açma kaydı. AI çağrısı yok → PENDING / iade gerekmez.
 * - Haftalık ücretsiz: yalnız hazır analizde; tek işlemde haftalık hak (`ANALYSIS_WEEKLY_FREE`, tutar 0, anahtar
 *   `weekly-free:{ISO hafta, TSİ}` — kullanıcı başına haftada bir) + açma. Koşul: doğrulanmış e-posta + ≥ 24 sa hesap.
 * - Premium / yönetici: 0 tutarlı defter satırı (`ANALYSIS_PREMIUM` / `ANALYSIS_FREE`) + açma; premium bitince açık kalır.
 * - Üretim (analiz yoksa) rotada mevcut güvenli akışla (`reserveCredits` → AI → kayıt); kayıttan sonra
 *   `recordGenerationUnlock` açma kaydını yazar.
 * Çift tık / iki sekme: açma `(userId, matchAnalysisId)` ve defter anahtarları tekil → en fazla bir düşüm.
 * Kredi hiçbir zaman maç sonucuna / tahmine bağlanmaz (karar 8).
 */
import { prisma } from '@/lib/prisma';
import {
  DuplicateSpendError,
  InsufficientCreditsError,
  analysisIdempotencyKey,
  isUniqueViolation,
} from '@/lib/credits';
import { todayIsoIstanbul } from '@/utils/dateStrip';

export const ANALYSIS_UNLOCK_COST = 1;
/** Haftalık ücretsiz açma için hesabın en az yaşı. */
export const WEEKLY_FREE_MIN_ACCOUNT_AGE_MS = 24 * 3600_000;

export type UnlockSource = 'CREDIT' | 'WEEKLY_FREE' | 'PREMIUM' | 'ADMIN' | 'LEGACY';

type AnalysisRef = { id: string; matchId: string };

export type UnlockResult = {
  unlockId: string;
  source: UnlockSource;
  /** Bu çağrıda kredi düştü mü (zaten açıksa false). */
  charged: boolean;
  /** Bu çağrıda yeni açma yazıldı mı. */
  created: boolean;
  balanceAfter: number | null;
};

export class WeeklyFreeUsedError extends Error {
  constructor() {
    super('Bu haftaki ücretsiz açma hakkını kullandın.');
    this.name = 'WeeklyFreeUsedError';
  }
}

export class WeeklyFreeNotEligibleError extends Error {
  constructor(readonly reason: 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_TOO_NEW') {
    super(
      reason === 'EMAIL_NOT_VERIFIED'
        ? 'Haftalık ücretsiz açma için e-posta adresini doğrulaman gerekiyor.'
        : 'Haftalık ücretsiz açma, hesap açıldıktan 24 saat sonra kullanılabilir.',
    );
    this.name = 'WeeklyFreeNotEligibleError';
  }
}

/** TSİ takvim gününe göre ISO hafta anahtarı ("2026-W40"). Hafta Pazartesi 00:00 TSİ başlar. */
export function isoWeekKeyIstanbul(now: number = Date.now()): string {
  const [y, m, d] = todayIsoIstanbul(new Date(now)).split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7; // Pazartesi 1 … Pazar 7
  date.setUTCDate(date.getUTCDate() + 4 - dow); // haftanın Perşembe'si → ISO yıl
  const isoYear = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function weeklyFreeIdempotencyKey(now: number = Date.now()): string {
  return `weekly-free:${isoWeekKeyIstanbul(now)}`;
}

export function weeklyFreeIneligibility(
  user: { emailVerified: Date | null; createdAt: Date },
  now: number = Date.now(),
): WeeklyFreeNotEligibleError['reason'] | null {
  if (!user.emailVerified) return 'EMAIL_NOT_VERIFIED';
  if (now - user.createdAt.getTime() < WEEKLY_FREE_MIN_ACCOUNT_AGE_MS) return 'ACCOUNT_TOO_NEW';
  return null;
}

export async function findUnlock(userId: string, matchAnalysisId: string) {
  return prisma.analysisUnlock.findUnique({
    where: { userId_matchAnalysisId: { userId, matchAnalysisId } },
    select: { id: true, source: true, createdAt: true },
  });
}

/** Bu hafta haftalık ücretsiz hak kullanıldı mı (yalnız okuma; talep `unlockWithWeeklyFree`'de atomik). */
export async function weeklyFreeUsed(userId: string, now: number = Date.now()): Promise<boolean> {
  const row = await prisma.creditTransaction.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: weeklyFreeIdempotencyKey(now) } },
    select: { id: true },
  });
  return row != null;
}

async function alreadyUnlocked(userId: string, analysis: AnalysisRef): Promise<UnlockResult | null> {
  const u = await findUnlock(userId, analysis.id);
  return u ? { unlockId: u.id, source: u.source as UnlockSource, charged: false, created: false, balanceAfter: null } : null;
}

/** Hazır analizi 1 krediyle açar. Yetersiz → `InsufficientCreditsError`; aynı maç için süren üretim → `DuplicateSpendError`. */
export async function unlockWithCredit(userId: string, analysis: AnalysisRef): Promise<UnlockResult> {
  const existing = await alreadyUnlocked(userId, analysis);
  if (existing) return existing;
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, credits: { gte: ANALYSIS_UNLOCK_COST } },
        data: { credits: { decrement: ANALYSIS_UNLOCK_COST } },
      });
      if (count === 0) throw new InsufficientCreditsError();
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const balanceAfter = user?.credits ?? 0;
      const spend = await tx.creditTransaction.create({
        data: {
          userId,
          type: 'ANALYSIS_SPEND',
          amount: -ANALYSIS_UNLOCK_COST,
          balanceAfter,
          matchId: analysis.matchId,
          idempotencyKey: analysisIdempotencyKey(analysis.matchId),
          status: 'SETTLED',
          note: 'Analiz açma',
        },
        select: { id: true },
      });
      const unlock = await tx.analysisUnlock.create({
        data: { userId, matchAnalysisId: analysis.id, matchId: analysis.matchId, source: 'CREDIT', creditTransactionId: spend.id },
        select: { id: true },
      });
      return { unlockId: unlock.id, source: 'CREDIT' as const, charged: true, created: true, balanceAfter };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Eşzamanlı ikinci istek: açma zaten yazıldıysa ücretsiz döner; yoksa aynı anahtarla süren bir üretim var.
    const raced = await alreadyUnlocked(userId, analysis);
    if (raced) return raced;
    const spend = await prisma.creditTransaction.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: analysisIdempotencyKey(analysis.matchId) } },
      select: { id: true, status: true, createdAt: true },
    });
    if (spend) throw new DuplicateSpendError(spend);
    throw err;
  }
}

/** Haftalık ücretsiz hakla açar (yalnız hazır analiz; uygunluk çağıranda `weeklyFreeIneligibility` ile). */
export async function unlockWithWeeklyFree(userId: string, analysis: AnalysisRef, now: number = Date.now()): Promise<UnlockResult> {
  const existing = await alreadyUnlocked(userId, analysis);
  if (existing) return existing;
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const claim = await tx.creditTransaction.create({
        data: {
          userId,
          type: 'ANALYSIS_WEEKLY_FREE',
          amount: 0,
          balanceAfter: user?.credits ?? 0,
          matchId: analysis.matchId,
          idempotencyKey: weeklyFreeIdempotencyKey(now),
          note: 'Haftalık ücretsiz analiz açma',
        },
        select: { id: true },
      });
      const unlock = await tx.analysisUnlock.create({
        data: { userId, matchAnalysisId: analysis.id, matchId: analysis.matchId, source: 'WEEKLY_FREE', creditTransactionId: claim.id },
        select: { id: true },
      });
      return { unlockId: unlock.id, source: 'WEEKLY_FREE' as const, charged: false, created: true, balanceAfter: user?.credits ?? null };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await alreadyUnlocked(userId, analysis);
    if (raced) return raced;
    throw new WeeklyFreeUsedError();
  }
}

/** Premium / yönetici açması: 0 tutarlı defter satırı + açma (premium bitince de açık kalır). */
export async function unlockAsPrivileged(userId: string, analysis: AnalysisRef, source: 'PREMIUM' | 'ADMIN'): Promise<UnlockResult> {
  const existing = await alreadyUnlocked(userId, analysis);
  if (existing) return existing;
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const row = await tx.creditTransaction.create({
        data: {
          userId,
          type: source === 'PREMIUM' ? 'ANALYSIS_PREMIUM' : 'ANALYSIS_FREE',
          amount: 0,
          balanceAfter: user?.credits ?? 0,
          matchId: analysis.matchId,
          note: source === 'PREMIUM' ? 'Premium: analiz açma' : 'Yönetici: kredisiz analiz',
        },
        select: { id: true },
      });
      const unlock = await tx.analysisUnlock.create({
        data: { userId, matchAnalysisId: analysis.id, matchId: analysis.matchId, source, creditTransactionId: row.id },
        select: { id: true },
      });
      return { unlockId: unlock.id, source, charged: false, created: true, balanceAfter: user?.credits ?? null };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await alreadyUnlocked(userId, analysis);
    if (raced) return raced;
    throw err;
  }
}

/**
 * Üretimden sonra açma kaydı: krediyle üretende rezervasyon satırına bağlı (`CREDIT`), premium / yönetici üretiminde
 * `unlockAsPrivileged`. Yarışı kaybeden (DB tekil kısıtı) kullanıcı da ödediği için açar (karar 6, iade yok).
 */
export async function recordGenerationUnlock(
  userId: string,
  analysis: AnalysisRef,
  paidBy: { reservationId: string } | { privileged: 'PREMIUM' | 'ADMIN' },
): Promise<UnlockResult> {
  if ('privileged' in paidBy) return unlockAsPrivileged(userId, analysis, paidBy.privileged);
  const existing = await alreadyUnlocked(userId, analysis);
  if (existing) return existing;
  try {
    const unlock = await prisma.analysisUnlock.create({
      data: { userId, matchAnalysisId: analysis.id, matchId: analysis.matchId, source: 'CREDIT', creditTransactionId: paidBy.reservationId },
      select: { id: true },
    });
    return { unlockId: unlock.id, source: 'CREDIT', charged: true, created: true, balanceAfter: null };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await alreadyUnlocked(userId, analysis);
    if (raced) return raced;
    throw err;
  }
}
