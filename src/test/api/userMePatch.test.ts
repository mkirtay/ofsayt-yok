import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  findFirst: vi.fn(),
  rl: vi.fn(),
  sanitize: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { update: h.update, findFirst: h.findFirst, findUnique: vi.fn() } } }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: h.rl }));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => 'u1') }));
vi.mock('@/lib/security', async (orig) => {
  const real = await orig<typeof import('@/lib/security')>();
  h.sanitize.mockImplementation(real.sanitizePlainText);
  return { ...real, sanitizePlainText: h.sanitize };
});

import handler, { config } from '@/pages/api/user/me';

function call(body: Record<string, unknown>) {
  const out = { status: 0, json: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k] = v;
      return this;
    },
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
  return handler({ method: 'PATCH', body, headers: {} } as unknown as NextApiRequest, res).then(() => out);
}

beforeEach(() => {
  h.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u1', ...data }));
  h.findFirst.mockReset().mockResolvedValue(null);
  h.rl.mockReset().mockResolvedValue({ success: true, remaining: 5, resetAt: Date.now() + 60_000 });
  h.sanitize.mockClear();
});

describe('PATCH /api/user/me — girdi sınırları', () => {
  it('gövde sınırı 16 KB (Next aşanı 413 ile reddeder)', () => {
    expect(config.api.bodyParser.sizeLimit).toBe('16kb');
  });

  it.each([
    ['name', 'x'.repeat(401)],
    ['bio', '<'.repeat(8001)],
    ['image', `https://a.b/${'x'.repeat(4097)}`],
  ])('ham %s tavanı aşılınca temizlemeden 400', async (field, value) => {
    const r = await call({ [field]: value });
    expect(r.status).toBe(400);
    expect(h.sanitize).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('tavan altındaki etiketli bio temizlenip kaydedilir', async () => {
    const r = await call({ bio: '<b>Merhaba</b>' });
    expect(r.status).toBe(200);
    expect(h.update.mock.calls[0]![0].data).toEqual({ bio: 'Merhaba' });
  });

  it('kullanıcı başına hız sınırı: 20 / 10 dk anahtarıyla sayılır, aşılınca 429 + Retry-After', async () => {
    await call({ bio: 'a' });
    expect(h.rl).toHaveBeenCalledWith('user-me-patch:user:u1', 20, 10 * 60_000);

    h.rl.mockResolvedValueOnce({ success: false, remaining: 0, resetAt: Date.now() + 90_000 });
    h.update.mockClear();
    const r = await call({ bio: 'a' });
    expect(r.status).toBe(429);
    expect(Number(r.headers['Retry-After'])).toBeGreaterThanOrEqual(89);
    expect(h.update).not.toHaveBeenCalled();
  });
});
