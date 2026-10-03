/**
 * Yönetici paneli — kullanıcı arama, ayrıntı, kredi ± ve premium ver / kaldır (kredi modeli v2, karar 10).
 * Her işlem atomik ve denetim izli: kredi `CreditTransaction` (ADMIN_GRANT, actorId, zorunlu gerekçe), premium
 * `PremiumGrant` (source ADMIN, actorId, not). Yeni ADMIN atama YOK (yalnız DB'de elle, karar 9).
 */
import { prisma } from '@/lib/prisma';
import { addCredits } from '@/lib/credits';

export const ADMIN_NOTE_MIN = 5;
export const ADMIN_CREDIT_MAX = 10_000;

export class AdminInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminInputError';
  }
}

const USER_FIELDS = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  credits: true,
  premiumUntil: true,
  emailVerified: true,
  createdAt: true,
} as const;

export async function searchUsers(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  return prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: term, mode: 'insensitive' } },
        { username: { contains: term, mode: 'insensitive' } },
        { id: term },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: USER_FIELDS,
  });
}

export async function getUserDetail(userId: string, opts: { before?: Date } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
  if (!user) return null;
  const [transactions, premiumGrants, unlockCount] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, amount: true, balanceAfter: true, matchId: true, note: true, status: true, actorId: true, createdAt: true },
    }),
    prisma.premiumGrant.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.analysisUnlock.count({ where: { userId } }),
  ]);
  return { user, transactions, premiumGrants, unlockCount };
}

function requireNote(note: unknown): string {
  const n = typeof note === 'string' ? note.trim() : '';
  if (n.length < ADMIN_NOTE_MIN) throw new AdminInputError(`Gerekçe en az ${ADMIN_NOTE_MIN} karakter olmalı.`);
  return n.slice(0, 500);
}

/** Kredi ekle (+) / çıkar (−). Atomik; eksiye inemez (`InsufficientCreditsError`). @returns yeni bakiye */
export async function adminAdjustCredits(actorId: string, userId: string, amountRaw: unknown, noteRaw: unknown): Promise<number> {
  const amount = Number(amountRaw);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > ADMIN_CREDIT_MAX) {
    throw new AdminInputError(`Tutar sıfırdan farklı bir tam sayı olmalı (en çok ±${ADMIN_CREDIT_MAX}).`);
  }
  const note = requireNote(noteRaw);
  return addCredits(userId, amount, 'ADMIN_GRANT', note, actorId);
}

/**
 * Premium ver (bitiş tarihi) ya da kaldır (`until` null). Atomik: alan + denetim satırı aynı işlemde.
 * @returns yeni premiumUntil
 */
export async function adminSetPremium(actorId: string, userId: string, untilRaw: unknown, noteRaw: unknown): Promise<Date | null> {
  const note = requireNote(noteRaw);
  let until: Date | null = null;
  if (untilRaw != null) {
    until = new Date(String(untilRaw));
    if (!Number.isFinite(until.getTime())) throw new AdminInputError('Geçersiz bitiş tarihi.');
    if (until.getTime() <= Date.now()) throw new AdminInputError('Bitiş tarihi gelecekte olmalı (kaldırmak için boş bırak).');
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: { premiumUntil: until }, select: { premiumUntil: true } });
    await tx.premiumGrant.create({ data: { userId, until, source: 'ADMIN', actorId, note } });
    return user.premiumUntil;
  });
}
