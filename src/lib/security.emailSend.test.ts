/** Resend'e giden istek: gönderen env'den (EMAIL_FROM), yanıt adresi iletişim kutusu (BRAND.contactEmail). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { verificationToken: { deleteMany: vi.fn(), create: vi.fn() } },
}));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: vi.fn() }));

import { createAndSendEmailVerification, createAndSendPasswordReset, EMAIL_REPLY_TO } from './security';
import { BRAND } from '@/config/brand';

type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function captureResend(): Sent[] {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    sent.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  });
  return sent;
}

describe('Resend gönderimi', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = `${BRAND.name} <noreply@example.test>`;
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.restoreAllMocks();
  });

  it('yanıt adresi info@getscor3.com (BRAND.contactEmail)', () => {
    expect(EMAIL_REPLY_TO).toBe('info@getscor3.com');
    expect(EMAIL_REPLY_TO).toBe(BRAND.contactEmail);
  });

  it.each([
    ['doğrulama', createAndSendEmailVerification],
    ['şifre sıfırlama', createAndSendPasswordReset],
  ])('%s: from env\'den, reply_to iletişim kutusu, alıcı aynı', async (_n, fn) => {
    const sent = captureResend();
    await fn('kisi@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://api.resend.com/emails');
    expect(sent[0]!.body).toMatchObject({ from: process.env.EMAIL_FROM, to: 'kisi@example.com', reply_to: EMAIL_REPLY_TO });
  });
});
