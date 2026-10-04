import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { verificationToken: { deleteMany: vi.fn(), create: vi.fn() } },
}));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: vi.fn() }));

import { createAndSendEmailVerification, createAndSendPasswordReset } from './security';

describe('e-posta gönderilemezse doğrulama / sıfırlama bağlantısı loglanmaz', () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY; // sağlayıcı yok → gönderim başarısız
    vi.restoreAllMocks();
  });

  it.each([
    ['doğrulama', createAndSendEmailVerification],
    ['sıfırlama', createAndSendPasswordReset],
  ])('%s', async (_n, fn) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await fn('kisi@example.com');
    const logged = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join('\n');
    expect(warn).toHaveBeenCalled();
    expect(logged).not.toMatch(/token=|https?:\/\/|[0-9a-f]{64}/);
  });
});

describe('checkSignupTurnstile — kayıt bot kapısı (web + mobil)', () => {
  it('geliştirmede atlanır', async () => {
    const { checkSignupTurnstile } = await import('./security');
    expect(await checkSignupTurnstile(undefined, '1.1.1.1', { NODE_ENV: 'development' })).toEqual({ ok: true });
  });

  it('üretimde anahtar yoksa kayıt reddedilir (sessizce atlanmaz)', async () => {
    const { checkSignupTurnstile } = await import('./security');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await checkSignupTurnstile('tok', '1.1.1.1', { NODE_ENV: 'production' });
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it('üretimde belirteç yoksa / doğrulanmazsa 400, doğrulanırsa geçer', async () => {
    const { checkSignupTurnstile } = await import('./security');
    const env = { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 's' };
    process.env.TURNSTILE_SECRET_KEY = 's';
    expect(await checkSignupTurnstile('', '1.1.1.1', env)).toMatchObject({ ok: false, status: 400 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    expect(await checkSignupTurnstile('kotu', '1.1.1.1', env)).toMatchObject({ ok: false, status: 400 });
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    expect(await checkSignupTurnstile('iyi', '1.1.1.1', env)).toEqual({ ok: true });
    delete process.env.TURNSTILE_SECRET_KEY;
  });
});
