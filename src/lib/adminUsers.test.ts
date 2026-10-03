import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

/** Yönetici paneli (karar 10): kredi ± atomik + gerekçe + actorId; premium ver / kaldır + denetim; yetki. */
const h = vi.hoisted(() => ({ db: null as FakeCreditDb | null, admin: true }));
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));
vi.mock('@/lib/requireAuth', () => ({
  requireAdmin: async (_req: NextApiRequest, res: NextApiResponse) => {
    if (h.admin) return { ok: true, userId: 'admin1' };
    res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    return { ok: false };
  },
}));

import { AdminInputError, adminAdjustCredits, adminSetPremium } from './adminUsers';
import { InsufficientCreditsError } from './credits';
import creditsRoute from '@/pages/api/admin/users/[id]/credits';
import premiumRoute from '@/pages/api/admin/users/[id]/premium';

let db: FakeCreditDb;
beforeEach(() => {
  vi.useRealTimers();
  db = createFakeCreditDb();
  h.db = db;
  h.admin = true;
});

function call(route: (req: NextApiRequest, res: NextApiResponse) => unknown, id: string, body: unknown) {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const res = {
    status(c: number) {
      out.status = c;
      return this;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
      return this;
    },
    setHeader() {},
  };
  return Promise.resolve(route({ method: 'POST', query: { id }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)).then(() => out);
}

describe('adminAdjustCredits', () => {
  it('ekle / çıkar: atomik, defterde ADMIN_GRANT + gerekçe + actorId', async () => {
    db.addUser('u', 3);
    expect(await adminAdjustCredits('admin1', 'u', 10, 'Telafi: ödeme hatası')).toBe(13);
    expect(await adminAdjustCredits('admin1', 'u', -4, 'Yanlış tanım düzeltmesi')).toBe(9);
    expect(db.ledgerOf('u').map((t) => [t.type, t.amount, t.balanceAfter, t.note, t.actorId])).toEqual([
      ['ADMIN_GRANT', 10, 13, 'Telafi: ödeme hatası', 'admin1'],
      ['ADMIN_GRANT', -4, 9, 'Yanlış tanım düzeltmesi', 'admin1'],
    ]);
  });

  it('gerekçesiz / sıfır / ondalık / çok büyük tutar reddedilir; bakiye eksiye inemez', async () => {
    db.addUser('u', 3);
    await expect(adminAdjustCredits('admin1', 'u', 5, 'kısa')).rejects.toBeInstanceOf(AdminInputError);
    for (const a of [0, 1.5, 'abc', 100_000]) {
      await expect(adminAdjustCredits('admin1', 'u', a, 'Geçerli gerekçe')).rejects.toBeInstanceOf(AdminInputError);
    }
    await expect(adminAdjustCredits('admin1', 'u', -4, 'Geçerli gerekçe')).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(db.balance('u')).toBe(3);
    expect(db.ledger).toHaveLength(0);
  });
});

describe('adminSetPremium', () => {
  it('ver ve kaldır: alan + PremiumGrant denetim satırı (ADMIN, actorId, not)', async () => {
    db.addUser('u', 0);
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect((await adminSetPremium('admin1', 'u', until, 'Kampanya: 1 ay'))?.toISOString()).toBe(until);
    expect(db.users.get('u')!.premiumUntil?.toISOString()).toBe(until);
    expect(await adminSetPremium('admin1', 'u', null, 'İade talebi')).toBeNull();
    expect(db.premiumGrants.map((g) => [g.until?.toISOString() ?? null, g.source, g.actorId, g.note])).toEqual([
      [until, 'ADMIN', 'admin1', 'Kampanya: 1 ay'],
      [null, 'ADMIN', 'admin1', 'İade talebi'],
    ]);
  });

  it('geçmiş / bozuk tarih ve gerekçesiz istek reddedilir', async () => {
    db.addUser('u', 0);
    await expect(adminSetPremium('admin1', 'u', '2020-01-01', 'Geçerli gerekçe')).rejects.toBeInstanceOf(AdminInputError);
    await expect(adminSetPremium('admin1', 'u', 'bozuk', 'Geçerli gerekçe')).rejects.toBeInstanceOf(AdminInputError);
    await expect(adminSetPremium('admin1', 'u', null, '')).rejects.toBeInstanceOf(AdminInputError);
    expect(db.premiumGrants).toHaveLength(0);
  });
});

describe('yönetici API uçları', () => {
  it('yönetici olmayan 403; geçersiz girdi 400; eksiye inme 409; başarı 200', async () => {
    db.addUser('u', 2);
    h.admin = false;
    expect((await call(creditsRoute, 'u', { amount: 5, note: 'Geçerli gerekçe' })).status).toBe(403);
    expect((await call(premiumRoute, 'u', { until: null, note: 'Geçerli gerekçe' })).status).toBe(403);
    h.admin = true;
    expect((await call(creditsRoute, 'u', { amount: 5 })).status).toBe(400);
    expect((await call(creditsRoute, 'u', { amount: -5, note: 'Geçerli gerekçe' })).status).toBe(409);
    expect(await call(creditsRoute, 'u', { amount: 5, note: 'Geçerli gerekçe' })).toEqual({ status: 200, body: { credits: 7 } });
    expect((await call(premiumRoute, 'u', { until: '2020-01-01', note: 'Geçerli gerekçe' })).status).toBe(400);
  });
});
