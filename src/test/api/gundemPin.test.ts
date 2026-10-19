/** /api/gundem/pin: girdi doğrulama (tutar, 140 karakter, bağlantı), hata → durum kodu eşlemesi, geçilen lidere bildirim. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  place: vi.fn(),
  notify: vi.fn(),
  author: vi.fn(async () => ({ status: 'ok', createdAt: new Date('2025-01-01'), username: 'ali' })),
  gate: vi.fn(async () => ({ ok: true, flags: [] })),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { notification: { create: h.notify } } }));
vi.mock('@/lib/termsConsentGate', () => ({ requireTermsConsent: async () => true }));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => 'u1') }));
vi.mock('@/lib/requireAuth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })),
  requestIp: () => '203.0.113.9',
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/gundem/authorGate', async (orig) => ({ ...(await orig<object>()), loadGundemAuthor: h.author }));
vi.mock('@/lib/moderation/contentGate', () => ({ moderateGundemText: h.gate }));
vi.mock('@/lib/gundem/pinState', () => ({ loadPinState: vi.fn(async () => ({ minBid: 2 })) }));
vi.mock('@/lib/pinBid', async (orig) => ({ ...(await orig<typeof import('@/lib/pinBid')>()), placePinBid: h.place }));

import handler from '@/pages/api/gundem/pin/index';
import { InsufficientCreditsError } from '@/lib/credits';
import { PinBidError } from '@/lib/pinBid';

async function post(body: unknown) {
  const out: { status: number; json: Record<string, unknown> } = { status: 200, json: {} };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(j: Record<string, unknown>) {
      out.json = j;
      return this;
    },
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler({ method: 'POST', body, query: {}, headers: {}, socket: {} } as unknown as NextApiRequest, res);
  return out;
}

beforeEach(() => {
  h.place.mockReset();
  h.notify.mockReset();
  h.gate.mockClear();
});

describe('POST /api/gundem/pin', () => {
  it.each([
    [{ amount: 0, message: 'a' }],
    [{ amount: 1.5, message: 'a' }],
    [{ amount: '3', message: 'a' }],
    [{ amount: 10_001, message: 'a' }],
    [{ amount: 1, message: '' }],
    [{ amount: 1, message: 'x'.repeat(141) }],
  ])('geçersiz girdi 400: %j', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(h.place).not.toHaveBeenCalled();
  });

  it('bağlantı yasak (LINK_NOT_ALLOWED), içerik filtresine bile gitmez', async () => {
    const r = await post({ amount: 1, message: 'bakın https://ornek.com' });
    expect(r).toMatchObject({ status: 400, json: { code: 'LINK_NOT_ALLOWED' } });
    expect(h.gate).not.toHaveBeenCalled();
  });

  it('içerik filtresi reddederse teklif verilmez', async () => {
    h.gate.mockResolvedValueOnce({ ok: false, status: 400, code: 'CONTENT_REJECTED', error: 'x' } as never);
    expect((await post({ amount: 1, message: 'merhaba' })).status).toBe(400);
    expect(h.place).not.toHaveBeenCalled();
  });

  it('başarı 201 + bakiye; geçilen lidere aktörsüz PIN_OUTBID', async () => {
    h.place.mockResolvedValueOnce({ bidId: 'b2', balance: 4, previous: { userId: 'u0', charged: 1, refunded: 6 } });
    const r = await post({ amount: 6, message: '  Merhaba Gündem  ' });
    expect(r.status).toBe(201);
    expect(r.json.credits).toBe(4);
    expect(h.place).toHaveBeenCalledWith({ userId: 'u1', amount: 6, message: 'Merhaba Gündem' });
    expect(h.notify).toHaveBeenCalledWith({ data: { userId: 'u0', actorId: null, type: 'PIN_OUTBID' } });
  });

  it('hata eşlemesi: düşük teklif 409 + minBid, lider 409, yetersiz kredi 402', async () => {
    h.place.mockRejectedValueOnce(new PinBidError('BID_TOO_LOW', 8));
    expect(await post({ amount: 7, message: 'a' })).toMatchObject({ status: 409, json: { code: 'BID_TOO_LOW', minBid: 8 } });
    h.place.mockRejectedValueOnce(new PinBidError('ALREADY_LEADER'));
    expect(await post({ amount: 9, message: 'a' })).toMatchObject({ status: 409, json: { code: 'ALREADY_LEADER' } });
    h.place.mockRejectedValueOnce(new InsufficientCreditsError());
    expect(await post({ amount: 9, message: 'a' })).toMatchObject({ status: 402, json: { code: 'INSUFFICIENT_CREDITS' } });
  });

  it('askıya alınmış kullanıcı 403', async () => {
    h.author.mockResolvedValueOnce({ status: 'suspended', until: new Date('2099-01-01') } as never);
    expect((await post({ amount: 1, message: 'a' })).status).toBe(403);
  });
});
