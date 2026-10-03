import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Kredi modeli v2: şifreli kayıt 0 krediyle (bonus doğrulamada), geçici e-posta reddedilir, kayıtta bonus yok. */
const h = vi.hoisted(() => ({ create: vi.fn(), bonus: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(async () => null), create: h.create } },
}));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: h.bonus }));
vi.mock('@/lib/security', () => ({ createAndSendEmailVerification: vi.fn(async () => undefined) }));

import { createUserAccount } from './accounts';

beforeEach(() => {
  h.create.mockReset();
  h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'n1', email: data.email, name: null, role: 'USER', username: null, credits: data.credits }));
  h.bonus.mockReset();
});

describe('createUserAccount — kredi modeli v2', () => {
  it('yeni hesap credits: 0 ile yazılır; kayıtta bonus verilmez (doğrulamada verilir)', async () => {
    const r = await createUserAccount({ email: 'Yeni@Gmail.com', password: 'Itest-Pass-123!' });
    expect(r.ok).toBe(true);
    expect(h.create.mock.calls[0]![0].data).toMatchObject({ email: 'yeni@gmail.com', credits: 0 });
    expect(h.bonus).not.toHaveBeenCalled();
  });

  it('geçici e-posta ile kayıt reddedilir, DB\'ye yazılmaz', async () => {
    const r = await createUserAccount({ email: 'x@mailinator.com', password: 'Itest-Pass-123!' });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(h.create).not.toHaveBeenCalled();
  });
});
