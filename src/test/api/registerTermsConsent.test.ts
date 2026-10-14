/** Kayıt API'si: Kullanım Koşulları + Gizlilik onayı sunucuda zorunlu; onay sürümü + zamanı hesapla yazılır. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ turnstile: vi.fn(), create: vi.fn(), findFirst: vi.fn() }));

vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, resetAt: Date.now() }),
  requestIp: () => '1.2.3.4',
}));
vi.mock('@/lib/security', () => ({
  checkSignupTurnstile: h.turnstile,
  createAndSendEmailVerification: vi.fn(async () => undefined),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { create: h.create, findFirst: h.findFirst, findUnique: vi.fn() } } }));
vi.mock('@/lib/referral', () => ({ recordReferral: vi.fn(async () => undefined) }));

import handler from '@/pages/api/auth/register';
import { TERMS_CONSENT_VERSION, isTermsAccepted } from '@/config/legalConsent';

function call(body: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader() { return this; },
  };
  const req = { method: 'POST', body, headers: {}, socket: { remoteAddress: '1.2.3.4' } } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

const valid = { email: 'yeni@gmail.com', password: 'Guclu-Sifre1!', turnstileToken: 'tok' };

beforeEach(() => {
  h.turnstile.mockReset();
  h.turnstile.mockResolvedValue({ ok: true });
  h.findFirst.mockReset();
  h.findFirst.mockResolvedValue(null);
  h.create.mockReset();
  h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'n1', email: data.email, name: null, role: 'USER', username: null, credits: 0,
  }));
});

describe('POST /api/auth/register — kayıt onayı', () => {
  it.each([undefined, false, 'true', 1, 'on', null])('acceptedTerms=%s → 400 TERMS_REQUIRED; Turnstile harcanmaz, hesap yok', async (v) => {
    const r = await call({ ...valid, acceptedTerms: v });
    expect(r.statusCode).toBe(400);
    expect(r.body).toMatchObject({ code: 'TERMS_REQUIRED' });
    expect(h.turnstile).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('acceptedTerms=true → 201; termsVersion + termsAcceptedAt yazılır', async () => {
    const before = Date.now();
    const r = await call({ ...valid, acceptedTerms: true });
    expect(r.statusCode).toBe(201);
    const data = h.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.termsVersion).toBe(TERMS_CONSENT_VERSION);
    expect(data.termsAcceptedAt).toBeInstanceOf(Date);
    expect((data.termsAcceptedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('isTermsAccepted yalnız boolean true', () => {
    expect(isTermsAccepted(true)).toBe(true);
    for (const v of [false, 'true', 1, {}, [], undefined]) expect(isTermsAccepted(v)).toBe(false);
  });
});
