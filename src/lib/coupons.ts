/**
 * Kupon kodları: `redeemCoupon` kodu kullanıcı adına bir kez bozar (+kredi, `COUPON` defter satırı).
 * Kurallar (hepsi tek işlemde): kod aktif ve süresi geçmemiş; toplam kullanım sınırı varsa dolmamış (koşullu sayaç
 * artırma → eşzamanlı istekler sınırı aşamaz); kullanıcı başına bir kez (`@@unique([couponId, userId])`); e-posta
 * doğrulanmış olmalı ve aynı posta kutusunu paylaşan başka bir hesap aynı kuponu bozmamış olmalı (kayıt bonusundaki
 * kural; `ali+1@…` ile çoğaltma yok).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canonicalEmail, sameMailboxWhere } from '@/lib/emailNormalize';
import { creditCreditsTx, isUniqueViolation } from '@/lib/credits';

export type CouponErrorCode = 'INVALID' | 'EXPIRED' | 'EXHAUSTED' | 'ALREADY_USED' | 'EMAIL_NOT_VERIFIED';

export class CouponError extends Error {
  constructor(readonly code: CouponErrorCode) {
    super(code);
    this.name = 'CouponError';
  }
}

/** Kullanıcının yazdığı kodu normalleştirir (boşluk at, büyük harf); geçersizse null. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null;
}

export async function redeemCoupon(userId: string, rawCode: unknown): Promise<{ credits: number; balance: number }> {
  const code = normalizeCouponCode(rawCode);
  if (!code) throw new CouponError('INVALID');
  try {
    return await prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.active) throw new CouponError('INVALID');
      if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) throw new CouponError('EXPIRED');

      const me = await tx.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
      if (!me) throw new CouponError('INVALID');
      if (!me.emailVerified) throw new CouponError('EMAIL_NOT_VERIFIED');

      const mailbox = me.email ? canonicalEmail(me.email) : null;
      if (mailbox) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coupon:${coupon.id}:${mailbox}`}))`;
        const siblings = await tx.user.findMany({
          where: { id: { not: userId }, OR: sameMailboxWhere(mailbox) as Prisma.UserWhereInput[] },
          select: { id: true },
          take: 50,
        });
        if (siblings.length > 0) {
          const used = await tx.couponRedemption.findFirst({
            where: { couponId: coupon.id, userId: { in: siblings.map((u) => u.id) } },
            select: { id: true },
          });
          if (used) throw new CouponError('ALREADY_USED');
        }
      }

      await tx.couponRedemption.create({ data: { couponId: coupon.id, userId, credits: coupon.credits } });
      // Sınır varsa koşullu artırma: ikinci eşzamanlı istek sınırı aşamaz (DB'de ayrıca CHECK).
      const { count } = await tx.coupon.updateMany({
        where:
          coupon.maxRedemptions === null
            ? { id: coupon.id }
            : { id: coupon.id, redeemedCount: { lt: coupon.maxRedemptions } },
        data: { redeemedCount: { increment: 1 } },
      });
      if (count === 0) throw new CouponError('EXHAUSTED');
      const balance = await creditCreditsTx(tx, userId, coupon.credits, { type: 'COUPON', note: `Kupon: ${coupon.code}` });
      return { credits: coupon.credits, balance };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CouponError('ALREADY_USED');
    throw err;
  }
}
