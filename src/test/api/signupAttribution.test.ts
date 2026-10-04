import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ updateMany: vi.fn(), create: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { updateMany: h.updateMany, create: h.create, findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) } },
}));
vi.mock('@/lib/requireAuth', () => ({ requireAuth: async () => ({ ok: true, userId: 'u1' }) }));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: vi.fn() }));
vi.mock('@/lib/security', () => ({ createAndSendEmailVerification: vi.fn(async () => undefined) }));

import attributionHandler from '@/pages/api/user/attribution';
import { createUserAccount } from '@/lib/accounts';

function call(body: unknown) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader() {},
  };
  const req = { method: 'POST', body, headers: {} } as unknown as NextApiRequest;
  return Promise.resolve(attributionHandler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('kayıt kaynağı yazımı', () => {
  beforeEach(() => {
    h.updateMany.mockReset();
    h.create.mockReset();
  });

  it('Google (attribution ucu): yalnız kaynağı boş ve son 24 saatte açılmış kendi hesabına yazar', async () => {
    h.updateMany.mockResolvedValue({ count: 1 });
    const res = await call({ source: 'instagram', medium: 'social', campaign: 'derbi', firstTouchAt: new Date().toISOString() });
    expect(res.statusCode).toBe(200);
    const arg = h.updateMany.mock.calls[0]![0];
    expect(arg.where.id).toBe('u1');
    expect(arg.where.firstTouchAt).toBeNull();
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
    expect(Date.now() - arg.where.createdAt.gte.getTime()).toBeGreaterThan(23 * 3600_000);
    expect(arg.data).toMatchObject({ signupUtmSource: 'instagram', signupUtmMedium: 'social', signupUtmCampaign: 'derbi' });
  });

  it('eski/kaynağı yazılmış hesap → no-op (updated:false); bozuk gövde → 400', async () => {
    h.updateMany.mockResolvedValue({ count: 0 });
    expect((await call({ firstTouchAt: new Date().toISOString() })).body).toEqual({ updated: false });
    expect((await call({ source: 'x' })).statusCode).toBe(400);
  });

  it('e-posta kaydı: doğrulanmış kaynak hesapla birlikte oluşturulur', async () => {
    h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'n1', email: data.email, name: null, role: 'USER', username: null, credits: 5 }));
    const firstTouchAt = new Date();
    const r = await createUserAccount({
      email: 'a@b.co',
      password: 'Guclu-Sifre-123!',
      attribution: { signupUtmSource: 'x', signupUtmMedium: null, signupUtmCampaign: null, firstTouchAt },
    });
    expect(r.ok).toBe(true);
    expect(h.create.mock.calls[0]![0].data).toMatchObject({ signupUtmSource: 'x', firstTouchAt });
  });
});
