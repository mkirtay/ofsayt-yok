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
