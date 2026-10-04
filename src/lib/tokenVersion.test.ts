import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** Şifre değişince / sıfırlanınca eski oturumlar düşer: web JWT ve mobil belirteç her kontrolde DB sürümüyle karşılaştırılır. */
const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-for-token-version-0123456789';
  return { findUnique: vi.fn() };
});
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: h.findUnique } } }));
vi.mock('@/lib/redis', () => ({ withRedis: async (_fn: unknown, fallback: unknown) => fallback })); // önbellek yok → DB
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));

import { authOptions, SessionRevokedError } from './auth-options';
import { getRequestAuth, issueMobileToken } from './mobileAuth';

const dbUser = (tokenVersion: number, role = 'USER') => ({
  id: 'u1',
  role,
  username: 'ali',
  name: 'Ali',
  image: null,
  email: 'ali@x.com',
  credits: 3,
  premiumUntil: null,
  tokenVersion,
});

const jwt = authOptions.callbacks!.jwt! as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

beforeEach(() => h.findUnique.mockReset());

describe('web oturumu (NextAuth jwt callback)', () => {
  it('girişte sürüm belirtece yazılır', async () => {
    const t = await jwt({ token: { sub: 'u1' }, user: { ...dbUser(4), id: 'u1' } });
    expect(t.tokenVersion).toBe(4);
  });

  it('her kontrolde sürüm karşılaştırılır; rol güncellenir, diğer alanlar 60 sn\'de bir', async () => {
    h.findUnique.mockResolvedValue(dbUser(2, 'ADMIN'));
    const t = await jwt({ token: { sub: 'u1', tokenVersion: 2, role: 'USER', roleSyncedAt: Date.now() } });
    expect(t.role).toBe('ADMIN');
    expect(h.findUnique).toHaveBeenCalledTimes(1); // yalnız sürüm sorgusu
    await jwt({ token: { sub: 'u1', tokenVersion: 2, roleSyncedAt: Date.now() - 61_000 } });
    expect(h.findUnique).toHaveBeenCalledTimes(3); // sürüm + 60 sn tazelemesi
  });

  it('şifre değişti (sürüm arttı) → oturum geçersiz', async () => {
    h.findUnique.mockResolvedValue(dbUser(3));
    await expect(jwt({ token: { sub: 'u1', tokenVersion: 2 } })).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it('kullanıcı silindi → oturum geçersiz', async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(jwt({ token: { sub: 'u1', tokenVersion: 0 } })).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it('sürüm alanından önce verilmiş belirteç 0 sayılır (toplu çıkış yok)', async () => {
    h.findUnique.mockResolvedValue(dbUser(0));
    await expect(jwt({ token: { sub: 'u1', roleSyncedAt: 1 } })).resolves.toMatchObject({ sub: 'u1' });
  });
});

describe('mobil belirteç (getRequestAuth)', () => {
  const req = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as unknown as NextApiRequest;
  const res = {} as NextApiResponse;

  it('sürüm eşleşirse kabul; rol belirteçten değil güncel kayıttan', async () => {
    const token = await issueMobileToken({ sub: 'u1', role: 'ADMIN', tokenVersion: 1 });
    h.findUnique.mockResolvedValue(dbUser(1, 'USER'));
    expect(await getRequestAuth(req(token), res)).toMatchObject({ id: 'u1', role: 'USER' });
  });

  it('şifre değişince eski belirteç reddedilir', async () => {
    const token = await issueMobileToken({ sub: 'u1', tokenVersion: 1 });
    h.findUnique.mockResolvedValue(dbUser(2));
    expect(await getRequestAuth(req(token), res)).toBeNull();
  });

  it('sürümsüz eski belirteç 0 sayılır', async () => {
    const token = await issueMobileToken({ sub: 'u1' });
    h.findUnique.mockResolvedValue(dbUser(0));
    expect(await getRequestAuth(req(token), res)).toMatchObject({ id: 'u1' });
  });
});
