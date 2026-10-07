import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ configured: true, down: false, store: new Map<string, number>(), calls: 0 }));
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => (h.configured ? {} : null),
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>, fallback: T) => {
    if (!h.configured || h.down) return fallback;
    h.calls++;
    // Upstash gibi: her komut ayrı tur; INCRBY atomik ve yeni değeri döner.
    await new Promise((r) => setTimeout(r, 1));
    return fn({
      incrby: async (k: string, by: number) => {
        const v = (h.store.get(k) ?? 0) + by;
        h.store.set(k, v);
        return v;
      },
      expire: async () => 1,
    });
  },
}));
vi.mock('@/lib/cacheNamespace', () => ({ cacheKeyPrefix: () => 't:' }));

import {
  ASSISTANT_DAILY_BUDGET_MICRO_USD,
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_ESTIMATE_MICRO_USD,
  ASSISTANT_OUTAGE_LIMIT,
  guestIpKey,
  reserveAssistantQuota,
  resetAssistantQuotaMemoryForTests,
  settleAssistantUsage,
  type QuotaState,
} from './quota';

const DAY = '2026-10-06';
const BUDGET = `t:assistant:budget:${DAY}`;
const q = (k: string) => `t:assistant:quota:${DAY}:${k}`;
const ok = (s: QuotaState) => (s.allowed ? s.reservation : null)!;

describe('asistan günlük kotası — önce ayır, sonra kesinleştir', () => {
  beforeEach(() => {
    h.configured = true;
    h.down = false;
    h.store.clear();
    h.calls = 0;
    resetAssistantQuotaMemoryForTests();
  });

  it('sınırlar: misafir 3, üye 15, premium 50; tahmin 0,004 USD', () => {
    expect(ASSISTANT_DAILY_LIMIT).toEqual({ guest: 3, user: 15, premium: 50 });
    expect(ASSISTANT_ESTIMATE_MICRO_USD).toBe(4_000);
  });

  it('rezervasyon anında sayar ve bütçeyi tahminle ayırır; kesinleştirme gerçek maliyet farkını yazar', async () => {
    const s = await reserveAssistantQuota('user', ['u:1'], DAY);
    expect(s).toMatchObject({ allowed: true, remaining: 14, limit: 15 });
    expect(h.store.get(q('u:1'))).toBe(1);
    expect(h.store.get(BUDGET)).toBe(4_000);
    await settleAssistantUsage(ok(s), { counted: true, costMicroUsd: 1_234 });
    expect(h.store.get(BUDGET)).toBe(1_234);
    expect(h.store.get(q('u:1'))).toBe(1);
    // Maliyet bilinmiyorsa (zaman aşımı) tahmin kalır.
    const s2 = await reserveAssistantQuota('user', ['u:1'], DAY);
    await settleAssistantUsage(ok(s2), { counted: true, costMicroUsd: null });
    expect(h.store.get(BUDGET)).toBe(5_234);
    expect(h.store.get(q('u:1'))).toBe(2);
  });

  it('boş yanıt: hak iade, maliyet bütçede kalır', async () => {
    const s = await reserveAssistantQuota('guest', ['ip:a', 'c:1'], DAY);
    await settleAssistantUsage(ok(s), { counted: false, costMicroUsd: 500 });
    expect(h.store.get(q('ip:a'))).toBe(0);
    expect(h.store.get(q('c:1'))).toBe(0);
    expect(h.store.get(BUDGET)).toBe(500);
    expect(await reserveAssistantQuota('guest', ['ip:a', 'c:1'], DAY)).toMatchObject({ allowed: true, remaining: 2 });
  });

  it('misafir: IP ya da çerez anahtarından biri dolunca kapanır; red geri alır; ertesi gün sıfır', async () => {
    const keys = ['ip:a', 'c:1'];
    for (let i = 0; i < 3; i++) expect((await reserveAssistantQuota('guest', keys, DAY)).allowed).toBe(true);
    expect(await reserveAssistantQuota('guest', keys, DAY)).toMatchObject({ allowed: false, reason: 'QUOTA' });
    expect(h.store.get(q('ip:a'))).toBe(3); // red sayaçta iz bırakmaz
    // Çerezi silen misafir: IP anahtarı hâlâ dolu; yeni çerez sayacı da geri alınır.
    expect((await reserveAssistantQuota('guest', ['ip:a', 'c:yeni'], DAY)).allowed).toBe(false);
    expect(h.store.get(q('c:yeni')) ?? 0).toBe(0);
    expect(h.store.get(BUDGET)).toBe(3 * 4_000);
    expect(await reserveAssistantQuota('guest', keys, '2026-10-07')).toMatchObject({ allowed: true, remaining: 2 });
  });

  it('eşzamanlı istekler sınırı aşamaz: 14/15 kullanılmışken 12 paralel istekten yalnız 1 geçer', async () => {
    h.store.set(q('u:1'), 14);
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveAssistantQuota('user', ['u:1'], DAY)));
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(results.filter((r) => !r.allowed && r.reason === 'QUOTA')).toHaveLength(11);
    expect(h.store.get(q('u:1'))).toBe(15);
    expect(h.store.get(BUDGET)).toBe(4_000);
  });

  it('günlük bütçe 5 USD: eşzamanlı isteklerle de aşılmaz; aşan red geri alınır; premium dahil herkese kapalı', async () => {
    h.store.set(BUDGET, ASSISTANT_DAILY_BUDGET_MICRO_USD - 4_000 * 2 - 1);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => reserveAssistantQuota('premium', [`u:${i}`], DAY)));
    expect(results.filter((r) => r.allowed)).toHaveLength(2);
    expect(results.filter((r) => !r.allowed && r.reason === 'BUDGET')).toHaveLength(6);
    expect(h.store.get(BUDGET)).toBe(ASSISTANT_DAILY_BUDGET_MICRO_USD - 1);
    for (let i = 0; i < 8; i++) expect(h.store.get(q(`u:${i}`)) ?? 0).toBe(results[i]!.allowed ? 1 : 0);
    expect(await reserveAssistantQuota('guest', ['ip:x', 'c:x'], DAY)).toMatchObject({ allowed: false, reason: 'BUDGET' });
  });

  it('Redis kesintisi: misafir KAPALI; üye instance içi küçük yedek sınırla (5) devam eder, kesinleştirme aynı depoda', async () => {
    h.down = true;
    expect(await reserveAssistantQuota('guest', ['ip:a', 'c:1'], DAY)).toMatchObject({ allowed: false, reason: 'UNAVAILABLE' });
    const first = await reserveAssistantQuota('user', ['u:1'], DAY);
    expect(first).toMatchObject({ allowed: true, remaining: ASSISTANT_OUTAGE_LIMIT - 1, limit: ASSISTANT_OUTAGE_LIMIT });
    expect(ok(first).store).toBe('memory');
    for (let i = 1; i < ASSISTANT_OUTAGE_LIMIT; i++) expect((await reserveAssistantQuota('user', ['u:1'], DAY)).allowed).toBe(true);
    expect(await reserveAssistantQuota('user', ['u:1'], DAY)).toMatchObject({ allowed: false, reason: 'QUOTA', limit: ASSISTANT_OUTAGE_LIMIT });
    await settleAssistantUsage(ok(first), { counted: false, costMicroUsd: 0 });
    expect((await reserveAssistantQuota('user', ['u:1'], DAY)).allowed).toBe(true);
    expect(h.store.size).toBe(0);
  });

  it('Redis hiç tanımlı değilse (yerel) instance içi, normal sınırlar', async () => {
    h.configured = false;
    for (let i = 0; i < 3; i++) expect((await reserveAssistantQuota('guest', ['ip:a', 'c:1'], DAY)).allowed).toBe(true);
    expect((await reserveAssistantQuota('guest', ['ip:a', 'c:1'], DAY)).allowed).toBe(false);
    expect(h.calls).toBe(0);
  });

  it('misafir IP anahtarı: IPv4 /24, IPv6 /64 (sıkıştırılmış yazım fark etmez, IPv4-mapped → /24); ham IP içermez', () => {
    expect(guestIpKey('85.100.20.7', 's')).toBe(guestIpKey('85.100.20.250', 's'));
    expect(guestIpKey('85.100.21.7', 's')).not.toBe(guestIpKey('85.100.20.7', 's'));
    expect(guestIpKey('85.100.20.7', 's')).not.toContain('85.100');
    expect(guestIpKey('2001:db8::1', 's')).toBe(guestIpKey('2001:db8::2', 's'));
    expect(guestIpKey('2001:db8::1', 's')).toBe(guestIpKey('2001:0db8:0000:0000:abcd::1', 's'));
    expect(guestIpKey('2001:db8:0:1::1', 's')).not.toBe(guestIpKey('2001:db8::1', 's'));
    expect(guestIpKey('::ffff:85.100.20.7', 's')).toBe(guestIpKey('85.100.20.9', 's'));
  });
});
