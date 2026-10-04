import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Kredi modeli v2: şifreli kayıt 0 krediyle (bonus doğrulamada), geçici e-posta reddedilir, kayıtta bonus yok. */
const h = vi.hoisted(() => ({ create: vi.fn(), bonus: vi.fn(), findFirst: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(async () => null), findFirst: h.findFirst, create: h.create } },
}));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: h.bonus }));
vi.mock('@/lib/security', () => ({ createAndSendEmailVerification: vi.fn(async () => undefined) }));

import { createUserAccount } from './accounts';

beforeEach(() => {
  h.create.mockReset();
  h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'n1', email: data.email, name: null, role: 'USER', username: null, credits: data.credits }));
  h.bonus.mockReset();
  h.findFirst.mockReset();
  h.findFirst.mockResolvedValue(null);
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

describe('createUserAccount — aynı posta kutusuna ikinci hesap yok (güvenlik denetimi 2026-10-04)', () => {
  it('yeni kayıtta kanonik e-posta yazılır; aramada e-posta, kanonik e-posta ve emailNormalized', async () => {
    const r = await createUserAccount({ email: 'Ali.Veli+2@googlemail.com', password: 'Itest-Pass-123!' });
    expect(r.ok).toBe(true);
    expect(h.create.mock.calls[0]![0].data).toMatchObject({
      email: 'ali.veli+2@googlemail.com',
      emailNormalized: 'aliveli@gmail.com',
    });
    expect(h.findFirst.mock.calls[0]![0].where).toEqual({
      OR: [{ email: 'ali.veli+2@googlemail.com' }, { email: 'aliveli@gmail.com' }, { emailNormalized: 'aliveli@gmail.com' }],
    });
  });

  it('aynı kanonik e-posta varsa 409; hesap ve bonus yok', async () => {
    h.findFirst.mockResolvedValue({ id: 'eski' });
    const r = await createUserAccount({ email: 'aliveli+bonus@gmail.com', password: 'Itest-Pass-123!' });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.bonus).not.toHaveBeenCalled();
  });

  it('eşzamanlı kayıt benzersiz indekse takılırsa 409', async () => {
    h.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const r = await createUserAccount({ email: 'a.b@gmail.com', password: 'Itest-Pass-123!' });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});
