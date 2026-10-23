import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  coupon: null as null | { id: string; code: string; credits: number; active: boolean; expiresAt: Date | null; maxRedemptions: number | null },
  user: { email: 'ali@x.com', emailVerified: new Date() as Date | null },
  siblingUsed: false,
  updateCount: 1,
  created: [] as unknown[],
  uniqueViolation: false,
}));

vi.mock('@/lib/prisma', () => {
  const tx = {
    coupon: { findUnique: async () => h.coupon, updateMany: async () => ({ count: h.updateCount }) },
    user: { findUnique: async () => h.user, findMany: async () => (h.siblingUsed ? [{ id: 'u2' }] : []) },
    couponRedemption: {
      findFirst: async () => (h.siblingUsed ? { id: 'r' } : null),
      create: async (a: unknown) => {
        if (h.uniqueViolation) {
          const { Prisma } = await import('@prisma/client');
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        }
        h.created.push(a);
      },
    },
    $executeRaw: async () => 0,
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock('@/lib/credits', async () => {
  const actual = await vi.importActual<typeof import('@/lib/credits')>('@/lib/credits');
  return { ...actual, creditCreditsTx: async (_t: unknown, _u: string, n: number) => 2 + n };
});

import { CouponError, CouponInputError, normalizeCouponCode, parseCouponInput, redeemCoupon } from './coupons';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof CouponError ? e.code : 'throw'));

beforeEach(() => {
  h.coupon = { id: 'c1', code: 'FUTBOL10', credits: 10, active: true, expiresAt: null, maxRedemptions: null };
  h.user = { email: 'ali@x.com', emailVerified: new Date() };
  h.siblingUsed = false;
  h.updateCount = 1;
  h.created = [];
  h.uniqueViolation = false;
});

describe('normalizeCouponCode', () => {
  it('boşluğu atar, büyük harfe çevirir, geçersizi reddeder', () => {
    expect(normalizeCouponCode('  futbol10 ')).toBe('FUTBOL10');
    expect(normalizeCouponCode('a')).toBeNull();
    expect(normalizeCouponCode('bad code!')).toBeNull();
    expect(normalizeCouponCode(42)).toBeNull();
  });
});

describe('redeemCoupon', () => {
  it('kodu bozar: +10 kredi', async () => {
    expect(await redeemCoupon('u1', 'futbol10')).toEqual({ credits: 10, balance: 12 });
    expect(h.created).toHaveLength(1);
  });
  it('olmayan / kapalı kod → INVALID', async () => {
    h.coupon = null;
    expect(await code(redeemCoupon('u1', 'YOK123'))).toBe('INVALID');
    h.coupon = { id: 'c1', code: 'X', credits: 5, active: false, expiresAt: null, maxRedemptions: null };
    expect(await code(redeemCoupon('u1', 'XXX'))).toBe('INVALID');
  });
  it('süresi dolmuş → EXPIRED', async () => {
    h.coupon!.expiresAt = new Date(Date.now() - 1000);
    expect(await code(redeemCoupon('u1', 'FUTBOL10'))).toBe('EXPIRED');
  });
  it('e-posta doğrulanmamış → EMAIL_NOT_VERIFIED', async () => {
    h.user.emailVerified = null;
    expect(await code(redeemCoupon('u1', 'FUTBOL10'))).toBe('EMAIL_NOT_VERIFIED');
  });
  it('aynı kullanıcı ikinci kez (tekil ihlal) → ALREADY_USED', async () => {
    h.uniqueViolation = true;
    expect(await code(redeemCoupon('u1', 'FUTBOL10'))).toBe('ALREADY_USED');
  });
  it('aynı posta kutusundaki başka hesap bozmuş → ALREADY_USED', async () => {
    h.siblingUsed = true;
    expect(await code(redeemCoupon('u1', 'FUTBOL10'))).toBe('ALREADY_USED');
  });
  it('toplam sınır dolu → EXHAUSTED', async () => {
    h.coupon!.maxRedemptions = 1;
    h.updateCount = 0;
    expect(await code(redeemCoupon('u1', 'FUTBOL10'))).toBe('EXHAUSTED');
  });
});

describe('parseCouponInput', () => {
  it('geçerli girdiyi normalleştirir', () => {
    const r = parseCouponInput({ code: ' kubilay10 ', credits: '10', maxRedemptions: '', expiresAt: '2026-12-31', note: ' x ' });
    expect(r).toMatchObject({ code: 'KUBILAY10', credits: 10, maxRedemptions: null, note: 'x' });
    expect(r.expiresAt?.toISOString()).toBe('2026-12-31T20:59:59.000Z');
  });
  it('geçersiz kod / kredi / sınır / tarihi reddeder', () => {
    const bad = (o: object) => () => parseCouponInput({ code: 'FUTBOL10', credits: 10, ...o });
    expect(bad({ code: 'a' })).toThrow(CouponInputError);
    expect(bad({ credits: 0 })).toThrow(CouponInputError);
    expect(bad({ credits: 5000 })).toThrow(CouponInputError);
    expect(bad({ maxRedemptions: -1 })).toThrow(CouponInputError);
    expect(bad({ expiresAt: '31.12.2026' })).toThrow(CouponInputError);
  });
});
