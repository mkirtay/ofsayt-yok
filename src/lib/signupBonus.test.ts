import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

/** Kredi modeli v2 kayıt bonusu: e-posta doğrulanınca +2, bir kez; 5 almış eski kullanıcıya yok. */
const h = vi.hoisted(() => ({ db: null as FakeCreditDb | null }));
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));

import { SIGNUP_BONUS_CREDITS, grantVerifiedSignupBonus } from './credits';

let db: FakeCreditDb;
beforeEach(() => {
  db = createFakeCreditDb();
  h.db = db;
});

describe('grantVerifiedSignupBonus', () => {
  it('yeni hesap (0): +2, SIGNUP_BONUS satırı; tekrar çağrı no-op', async () => {
    db.addUser('n', 0);
    expect(SIGNUP_BONUS_CREDITS).toBe(2);
    expect(await grantVerifiedSignupBonus('n')).toBe(true);
    expect(await grantVerifiedSignupBonus('n')).toBe(false);
    expect(db.balance('n')).toBe(2);
    expect(db.ledgerOf('n')).toEqual([expect.objectContaining({ type: 'SIGNUP_BONUS', amount: 2, balanceAfter: 2, idempotencyKey: 'signup-bonus' })]);
  });

  it('eşzamanlı iki doğrulama olayı → bir bonus', async () => {
    db.addUser('n', 0);
    const rs = await Promise.all([grantVerifiedSignupBonus('n'), grantVerifiedSignupBonus('n'), grantVerifiedSignupBonus('n')]);
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect(db.balance('n')).toBe(2);
  });

  it('eski kullanıcı (5 kredilik SIGNUP_BONUS almış) doğrulasa ek bonus yok; kullanıcı yoksa false', async () => {
    db.addUser('old', 3);
    db.ledger.push({
      id: 'b', userId: 'old', type: 'SIGNUP_BONUS', amount: 5, balanceAfter: 5, matchId: null, note: null,
      idempotencyKey: null, status: null, refundOfId: null, createdAt: new Date('2026-07-01'),
    });
    expect(await grantVerifiedSignupBonus('old')).toBe(false);
    expect(db.balance('old')).toBe(3);
    expect(await grantVerifiedSignupBonus('yok')).toBe(false);
  });
});
