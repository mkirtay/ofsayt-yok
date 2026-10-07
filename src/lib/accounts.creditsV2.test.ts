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
      OR: [
        { email: 'ali.veli+2@googlemail.com' },
        { emailNormalized: 'aliveli@gmail.com' },
        { email: 'aliveli@gmail.com' },
        { email: { startsWith: 'aliveli+', endsWith: '@gmail.com' } },
        { email: { startsWith: 'aliveli+', endsWith: '@googlemail.com' } },
      ],
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

  describe('gerçekçi eşleşme (bellek içi satırlar; Prisma where: eşitlik + startsWith/endsWith)', () => {
    type Row = { id: string; email: string; emailNormalized: string | null };
    let rows: Row[];
    const matchCond = (v: string | null, c: unknown) =>
      typeof c === 'string'
        ? v === c
        : !!v && v.startsWith((c as { startsWith: string }).startsWith) && v.endsWith((c as { endsWith: string }).endsWith);
    beforeEach(() => {
      rows = [];
      h.findFirst.mockImplementation(async ({ where }: { where: { OR: Array<Record<string, unknown>> } }) => {
        const hit = rows.find((r) =>
          where.OR.some((w) => Object.entries(w).every(([k, c]) => matchCond(r[k as keyof Row] as string | null, c))),
        );
        return hit ? { id: hit.id } : null;
      });
      h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        rows.push({ id: `u${rows.length}`, email: data.email as string, emailNormalized: data.emailNormalized as string });
        return { id: `u${rows.length}`, email: data.email, name: null, role: 'USER', username: null, credits: data.credits };
      });
    });

    it('outlook: + etiketli varyant aynı posta kutusu → 409 (iki yönde)', async () => {
      expect((await createUserAccount({ email: 'ali@outlook.com', password: 'Itest-Pass-123!' })).ok).toBe(true);
      for (const e of ['ali+1@outlook.com', 'Ali+bonus@Outlook.com.', ' ALI+x+y@outlook.com ']) {
        expect(await createUserAccount({ email: e, password: 'Itest-Pass-123!' })).toMatchObject({ ok: false, status: 409 });
      }
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emailNormalized).toBe('ali@outlook.com');
      // farklı posta kutusu serbest
      expect((await createUserAccount({ email: 'ali.veli@outlook.com', password: 'Itest-Pass-123!' })).ok).toBe(true);
    });

    it('eski kuralla yazılmış satır (emailNormalized = ham + etiketli adres) da yakalanır', async () => {
      rows.push({ id: 'eski', email: 'ali+1@hotmail.com', emailNormalized: 'ali+1@hotmail.com' });
      rows.push({ id: 'cok-eski', email: 'veli+x@icloud.com', emailNormalized: null });
      for (const e of ['ali@hotmail.com', 'ali+2@hotmail.com', 'veli@icloud.com', 'veli+y@icloud.com']) {
        expect(await createUserAccount({ email: e, password: 'Itest-Pass-123!' })).toMatchObject({ ok: false, status: 409 });
      }
      expect(h.create).not.toHaveBeenCalled();
    });

    it('Unicode tam genişlik geçici alan adı da reddedilir', async () => {
      const r = await createUserAccount({ email: 'x@ｍａｉｌｉｎａｔｏｒ．ｃｏｍ', password: 'Itest-Pass-123!' });
      expect(r).toMatchObject({ ok: false, status: 400 });
      expect(h.create).not.toHaveBeenCalled();
    });
  });
});
