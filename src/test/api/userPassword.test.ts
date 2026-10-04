import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  bearer: false,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: h.findUnique, update: h.update } } }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })) }));
vi.mock('bcryptjs', () => ({ compare: vi.fn(async (a: string) => a === 'Eski-Sifre-123!'), hash: vi.fn(async () => 'HASH') }));
vi.mock('@/lib/mobileAuth', () => ({
  getRequestUserId: vi.fn(async () => 'u1'),
  hasBearerToken: () => h.bearer,
  issueMobileToken: vi.fn(async () => 'yeni-belirtec'),
}));

import handler from '@/pages/api/user/password';

function call(body: Record<string, unknown>) {
  const out = { status: 0, json: undefined as unknown };
  const res = {
    setHeader: vi.fn(),
    status(code: number) {
      out.status = code;
      return this;
    },
    json(v: unknown) {
      out.json = v;
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  return handler({ method: 'POST', body, headers: {} } as unknown as NextApiRequest, res).then(() => out);
}

beforeEach(() => {
  h.bearer = false;
  h.findUnique.mockReset().mockResolvedValue({ password: 'x' });
  h.update.mockReset().mockResolvedValue({
    id: 'u1', role: 'USER', credits: 0, email: 'a@b.c', name: null, username: null, tokenVersion: 3,
  });
});

describe('POST /api/user/password', () => {
  it('kayıtla aynı şifre kuralı (6 karakter artık yetmez)', async () => {
    const r = await call({ currentPassword: 'Eski-Sifre-123!', newPassword: 'abcdef' });
    expect(r.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('şifre değişince tokenVersion artar (tüm oturumlar düşer)', async () => {
    const r = await call({ currentPassword: 'Eski-Sifre-123!', newPassword: 'Yeni-Sifre-456!' });
    expect(r.status).toBe(200);
    expect(h.update.mock.calls[0]![0].data).toEqual({ password: 'HASH', tokenVersion: { increment: 1 } });
    expect(r.json).toEqual({ ok: true, sessionsRevoked: true });
  });

  it('mobil istemciye yeni belirteç döner', async () => {
    h.bearer = true;
    const r = await call({ currentPassword: 'Eski-Sifre-123!', newPassword: 'Yeni-Sifre-456!' });
    expect(r.json).toEqual({ ok: true, sessionsRevoked: true, token: 'yeni-belirtec' });
  });

  it('mevcut şifre yanlışsa değişmez', async () => {
    const r = await call({ currentPassword: 'yanlis', newPassword: 'Yeni-Sifre-456!' });
    expect(r.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});
