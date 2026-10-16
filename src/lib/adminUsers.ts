/**
 * Yönetici paneli — kullanıcı arama, ayrıntı, kredi ± (kredi modeli v2, karar 10).
 * Her işlem atomik ve denetim izli: kredi `CreditTransaction` (ADMIN_GRANT, actorId, zorunlu gerekçe). Premium ver /
 * kaldır ucu 2026-10-16'da kaldırıldı (premium sistemi yok; PremiumGrant tablosu DB'de geçmiş kayıt olarak duruyor).
 * Yeni ADMIN atama YOK (yalnız DB'de elle, karar 9).
 */
import { prisma } from '@/lib/prisma';
import { addCredits } from '@/lib/credits';
import { DELETED_USER_ID } from '@/config/deletedUser';
import { isGundemSuspended } from '@/lib/gundem/authorGate';

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
  emailVerified: true,
  createdAt: true,
} as const;

export async function searchUsers(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  return prisma.user.findMany({
    where: {
      id: { not: DELETED_USER_ID },
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

export const ADMIN_LIST_PAGE = 50;

/**
 * Tüm kullanıcılar listesi (yönetici): en yeni kayıt üstte, sayfa başına 50, cursor = son satırın id'si. "Silinmiş
 * kullanıcı" yer tutucusu listede yok. Alanlar açık beyaz liste: şifre, belirteç, oturum sürümü vb. ASLA seçilmez.
 */
export async function listUsers(cursor: string | null, now = new Date()) {
  const rows = await prisma.user.findMany({
    where: { id: { not: DELETED_USER_ID } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ADMIN_LIST_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      credits: true,
      createdAt: true,
      emailVerified: true,
      termsAcceptedAt: true,
      gundemSuspendedUntil: true,
    },
  });
  const hasMore = rows.length > ADMIN_LIST_PAGE;
  const page = hasMore ? rows.slice(0, ADMIN_LIST_PAGE) : rows;
  return {
    users: page.map(({ gundemSuspendedUntil, ...u }) => ({
      ...u,
      gundemSuspended: isGundemSuspended(gundemSuspendedUntil, now),
      gundemSuspendedUntil: isGundemSuspended(gundemSuspendedUntil, now) ? gundemSuspendedUntil : null,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getUserDetail(userId: string, opts: { before?: Date } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
  if (!user) return null;
  const [transactions, unlockCount] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, amount: true, balanceAfter: true, matchId: true, note: true, status: true, actorId: true, createdAt: true },
    }),
    prisma.analysisUnlock.count({ where: { userId } }),
  ]);
  return { user, transactions, unlockCount };
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
