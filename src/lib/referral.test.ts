import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

const h = vi.hoisted(() => ({ db: null as FakeCreditDb | null }));
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));

import {
  REFERRER_MONTHLY_CAP,
  ensureReferralCode,
  grantReferralRewardOnFirstPurchase,
  normalizeReferralCode,
  recordReferral,
} from './referral';

let db: FakeCreditDb;
beforeEach(() => {
  db = createFakeCreditDb();
  h.db = db;
});

describe('davet altyapısı', () => {
  it('kod: 8 karakter, karışan karakter yok, kalıcı; normalize büyük harf', async () => {
    db.addUser('a', 0);
    const code = await ensureReferralCode('a');
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(await ensureReferralCode('a')).toBe(code);
    expect(normalizeReferralCode(` ${code.toLowerCase()} `)).toBe(code);
    expect(normalizeReferralCode('O0I1L')).toBeNull();
  });

  it('kayıtta davet: geçerli kod → kayıt + referredById; kendine / geçersiz / ikinci kez → false', async () => {
    db.addUser('a', 0);
    db.addUser('b', 0);
    const code = await ensureReferralCode('a');
    expect(await recordReferral('b', code)).toBe(true);
    expect(db.users.get('b')!.referredById).toBe('a');
    expect(await recordReferral('b', code)).toBe(false);
    expect(await recordReferral('a', code)).toBe(false);
    expect(await recordReferral('b', 'XXXXXXXX')).toBe(false);
    expect(db.referrals).toHaveLength(1);
  });

  it('ilk satın alma ödülü: iki tarafa +2, bir kez; davet yoksa null', async () => {
    db.addUser('a', 1);
    db.addUser('b', 0);
    await recordReferral('b', await ensureReferralCode('a'));
    expect(await grantReferralRewardOnFirstPurchase('b')).toEqual({ referee: true, referrer: true });
    expect(await grantReferralRewardOnFirstPurchase('b')).toBeNull();
    expect([db.balance('a'), db.balance('b')]).toEqual([3, 2]);
    expect(db.ledger.map((t) => [t.userId, t.type, t.amount])).toEqual([
      ['b', 'REFERRAL_BONUS', 2],
      ['a', 'REFERRAL_BONUS', 2],
    ]);
    db.addUser('c', 0);
    expect(await grantReferralRewardOnFirstPurchase('c')).toBeNull();
  });

  it('davet edenin aylık tavanı: tavan dolunca yalnız davet edilen alır', async () => {
    db.addUser('a', 0);
    for (let i = 0; i < REFERRER_MONTHLY_CAP; i++) {
      db.referrals.push({ id: `old${i}`, referrerId: 'a', refereeId: `x${i}`, createdAt: new Date(), rewardedAt: new Date() });
    }
    db.addUser('b', 0);
    await recordReferral('b', await ensureReferralCode('a'));
    expect(await grantReferralRewardOnFirstPurchase('b')).toEqual({ referee: true, referrer: false });
    expect([db.balance('a'), db.balance('b')]).toEqual([0, 2]);
  });

  it('ödül fonksiyonu ödeme entegrasyonuna kadar hiçbir yerden çağrılmaz', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/referral(\.test)?\.ts$/.test(name)) {
          if (readFileSync(p, 'utf8').includes('grantReferralRewardOnFirstPurchase')) offenders.push(p);
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('davet — etkinleştirme ödülü ve sonradan bağlama (büyüme raporu 2.3)', () => {
  it('bayrak kapalıyken ödül yok; açıkken doğrulanmış + davetli kullanıcıya bir kez', async () => {
    const { grantReferralActivationReward } = await import('./referral');
    db.addUser('a', 0);
    db.addUser('b', 0, 'USER', { emailVerified: new Date() });
    await recordReferral('b', await ensureReferralCode('a'));
    delete process.env.REFERRAL_ACTIVATION_REWARD_ENABLED;
    expect(await grantReferralActivationReward('b')).toBeNull();
    process.env.REFERRAL_ACTIVATION_REWARD_ENABLED = 'true';
    try {
      expect(await grantReferralActivationReward('b')).toEqual({ referee: true, referrer: true });
      expect(await grantReferralActivationReward('b')).toBeNull();
      expect([db.balance('a'), db.balance('b')]).toEqual([2, 2]);
    } finally {
      delete process.env.REFERRAL_ACTIVATION_REWARD_ENABLED;
    }
  });

  it('e-postası doğrulanmamış davetliye ödül yok', async () => {
    const { grantReferralActivationReward } = await import('./referral');
    db.addUser('a', 0);
    db.addUser('b', 0, 'USER', { emailVerified: null });
    await recordReferral('b', await ensureReferralCode('a'));
    process.env.REFERRAL_ACTIVATION_REWARD_ENABLED = 'true';
    try {
      expect(await grantReferralActivationReward('b')).toBeNull();
    } finally {
      delete process.env.REFERRAL_ACTIVATION_REWARD_ENABLED;
    }
  });

  it('Google ile yeni hesap: 48 saat içinde ve bağlı değilse bağlanır; eski hesap bağlanmaz', async () => {
    const { claimReferralForNewUser } = await import('./referral');
    db.addUser('a', 0);
    db.addUser('yeni', 0, 'USER', { createdAt: new Date() });
    db.addUser('eski', 0, 'USER', { createdAt: new Date(Date.now() - 3 * 86_400_000) });
    const code = await ensureReferralCode('a');
    expect(await claimReferralForNewUser('eski', code)).toBe(false);
    expect(await claimReferralForNewUser('yeni', code)).toBe(true);
    expect(await claimReferralForNewUser('yeni', code)).toBe(false);
  });
});
