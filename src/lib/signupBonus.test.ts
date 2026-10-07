import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

/** Kredi modeli v2 kayıt bonusu: e-posta doğrulanınca +2, bir kez; 5 almış eski kullanıcıya yok; posta kutusu başına bir. */
const h = vi.hoisted(() => ({ db: null as FakeCreditDb | null }));
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));

import { SIGNUP_BONUS_CREDITS, grantVerifiedSignupBonus } from './credits';

let db: FakeCreditDb;
const VERIFIED = { emailVerified: new Date('2026-10-01') };
beforeEach(() => {
  db = createFakeCreditDb();
  h.db = db;
});

describe('grantVerifiedSignupBonus', () => {
  it('yeni hesap (0): +2, SIGNUP_BONUS satırı; tekrar çağrı no-op', async () => {
    db.addUser('n', 0, 'USER', VERIFIED);
    expect(SIGNUP_BONUS_CREDITS).toBe(2);
    expect(await grantVerifiedSignupBonus('n')).toBe(true);
    expect(await grantVerifiedSignupBonus('n')).toBe(false);
    expect(db.balance('n')).toBe(2);
    expect(db.ledgerOf('n')).toEqual([expect.objectContaining({ type: 'SIGNUP_BONUS', amount: 2, balanceAfter: 2, idempotencyKey: 'signup-bonus' })]);
  });

  it('eşzamanlı iki doğrulama olayı → bir bonus', async () => {
    db.addUser('n', 0, 'USER', VERIFIED);
    const rs = await Promise.all([grantVerifiedSignupBonus('n'), grantVerifiedSignupBonus('n'), grantVerifiedSignupBonus('n')]);
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect(db.balance('n')).toBe(2);
  });

  it('eski kullanıcı (5 kredilik SIGNUP_BONUS almış) doğrulasa ek bonus yok; kullanıcı yoksa false', async () => {
    db.addUser('old', 3, 'USER', VERIFIED);
    db.ledger.push({
      id: 'b', userId: 'old', type: 'SIGNUP_BONUS', amount: 5, balanceAfter: 5, matchId: null, note: null,
      idempotencyKey: null, status: null, refundOfId: null, createdAt: new Date('2026-07-01'),
    });
    expect(await grantVerifiedSignupBonus('old')).toBe(false);
    expect(db.balance('old')).toBe(3);
    expect(await grantVerifiedSignupBonus('yok')).toBe(false);
  });

  it('doğrulanmamış hesap bonus alamaz (çağıran yanlışlıkla çağırsa bile)', async () => {
    db.addUser('u', 0, 'USER', { email: 'ali@outlook.com' });
    expect(await grantVerifiedSignupBonus('u')).toBe(false);
    expect(db.balance('u')).toBe(0);
    expect(db.ledgerOf('u')).toEqual([]);
  });

  it('aynı posta kutusu (+etiket varyantı, eski kuralla açılmış hesaplar): yalnız ilk doğrulayan bonus alır', async () => {
    // Kural genişlemeden önce açılmış, doğrulanmamış bekleyen hesaplar (emailNormalized eski kuralla = ham adres)
    db.addUser('a1', 0, 'USER', { ...VERIFIED, email: 'ali+1@outlook.com', emailNormalized: 'ali+1@outlook.com' });
    db.addUser('a2', 0, 'USER', { ...VERIFIED, email: 'ali+2@outlook.com', emailNormalized: 'ali+2@outlook.com' });
    db.addUser('a3', 0, 'USER', { ...VERIFIED, email: 'ali@outlook.com', emailNormalized: null });
    db.addUser('b', 0, 'USER', { ...VERIFIED, email: 'ali.veli@outlook.com', emailNormalized: 'ali.veli@outlook.com' });
    expect(await grantVerifiedSignupBonus('a1')).toBe(true);
    expect(await grantVerifiedSignupBonus('a2')).toBe(false);
    expect(await grantVerifiedSignupBonus('a3')).toBe(false);
    expect(await grantVerifiedSignupBonus('b')).toBe(true); // farklı posta kutusu
    expect([db.balance('a1'), db.balance('a2'), db.balance('a3'), db.balance('b')]).toEqual([2, 0, 0, 2]);
  });

  it('gmail nokta/googlemail varyantı (backfill sonrası emailNormalized dolu) → posta kutusu başına bir', async () => {
    db.addUser('g1', 0, 'USER', { ...VERIFIED, email: 'ali.veli@gmail.com', emailNormalized: 'aliveli@gmail.com' });
    db.addUser('g2', 0, 'USER', { ...VERIFIED, email: 'aliveli+x@googlemail.com', emailNormalized: null });
    expect(await grantVerifiedSignupBonus('g2')).toBe(true);
    expect(await grantVerifiedSignupBonus('g1')).toBe(false);
  });

  it('aynı posta kutusunun eşzamanlı doğrulamaları → tek bonus (posta kutusu kilidi)', async () => {
    for (let i = 0; i < 5; i++) db.addUser(`p${i}`, 0, 'USER', { ...VERIFIED, email: `ali+${i}@icloud.com` });
    const rs = await Promise.all([0, 1, 2, 3, 4].map((i) => grantVerifiedSignupBonus(`p${i}`)));
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect([0, 1, 2, 3, 4].reduce((sum, i) => sum + db.balance(`p${i}`), 0)).toBe(2);
  });
});
