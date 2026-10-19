/**
 * Gündem 1. sıra teklifi — GERÇEK SQL (PGlite, bellek içi; ağdaki DB'ye bağlanılmaz): kredi düşümü / iadesi, haftada tek
 * lider (kilit + kısmi tekil indeks), tembel hafta sıfırlama ve yönetici kaldırması.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let pin: typeof import('@/lib/pinBid');

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  pin = await import('@/lib/pinBid');
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

let n = 0;
const mkUser = (credits: number) => prisma.user.create({ data: { email: `pin${++n}@example.test`, credits }, select: { id: true } });
const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;
const H = 3_600_000;
const D = 24 * H;

describe('placePinBid (PGlite)', () => {
  // Her senaryo ayrı bir haftada (birbirini etkilemesin).
  it('boş sıra 1 krediyle başlar; düşüm + PIN_BID defteri', async () => {
    const now = new Date('2026-11-03T10:00:00Z');
    const a = await mkUser(5);
    await expect(pin.placePinBid({ userId: a.id, amount: 0, message: 'x', now })).rejects.toMatchObject({ code: 'BID_TOO_LOW', minBid: 1 });
    const r = await pin.placePinBid({ userId: a.id, amount: 1, message: 'merhaba', now });
    expect(r.balance).toBe(4);
    expect(r.previous).toBeNull();
    expect(await credits(a.id)).toBe(4);
    const tx = await prisma.creditTransaction.findFirstOrThrow({ where: { userId: a.id } });
    expect(tx).toMatchObject({ type: 'PIN_BID', amount: -1, status: 'SETTLED' });
    expect((await pin.currentPinLeader(now))?.userId).toBe(a.id);
  });

  it('geçilen lidere başlayan gün oranında iade; en az +1; lider kendini geçemez; yetersiz bakiye', async () => {
    const t0 = new Date('2026-11-10T10:00:00Z');
    const a = await mkUser(20);
    const b = await mkUser(20);
    const poor = await mkUser(3);
    await pin.placePinBid({ userId: a.id, amount: 7, message: 'A', now: t0 });
    await expect(pin.placePinBid({ userId: a.id, amount: 9, message: 'A2', now: t0 })).rejects.toMatchObject({ code: 'ALREADY_LEADER' });
    await expect(pin.placePinBid({ userId: b.id, amount: 7, message: 'B', now: t0 })).rejects.toMatchObject({ code: 'BID_TOO_LOW', minBid: 8 });
    await expect(pin.placePinBid({ userId: poor.id, amount: 8, message: 'P', now: t0 })).rejects.toBeInstanceOf(pin.InsufficientCreditsError);
    expect(await credits(poor.id)).toBe(3);

    // 1 gün 2 saat sonra → 2 başlayan gün: ceil(7*2/7)=2 alınır, 5 iade.
    const r = await pin.placePinBid({ userId: b.id, amount: 8, message: 'B', now: new Date(t0.getTime() + D + 2 * H) });
    expect(r.previous).toMatchObject({ userId: a.id, charged: 2, refunded: 5 });
    expect(await credits(a.id)).toBe(20 - 7 + 5);
    expect(await credits(b.id)).toBe(12);
    const old = await prisma.pinBid.findFirstOrThrow({ where: { userId: a.id } });
    expect(old).toMatchObject({ status: 'OUTBID', chargedAmount: 2, refundedAmount: 5 });
    expect(await prisma.creditTransaction.findFirst({ where: { userId: a.id, type: 'PIN_REFUND' } })).toMatchObject({ amount: 5 });
  });

  it('eşzamanlı aynı tutarlı teklifler: yalnız biri lider, diğeri BID_TOO_LOW; kaybedenden kredi düşmez', async () => {
    const now = new Date('2026-11-17T10:00:00Z');
    const us = await Promise.all([mkUser(10), mkUser(10), mkUser(10)]);
    const res = await Promise.allSettled(us.map((u) => pin.placePinBid({ userId: u.id, amount: 3, message: 'yarış', now })));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.pinBid.count({ where: { status: 'ACTIVE', weekStart: pin.pinWeekStart(now) } })).toBe(1);
    const balances = await Promise.all(us.map((u) => credits(u.id)));
    expect(balances.sort()).toEqual([10, 10, 7]);
  });

  it('hafta sıfırlanınca lider tamamını öder (iade yok), yeni hafta 1 krediyle başlar', async () => {
    const t0 = new Date('2026-11-24T10:00:00Z'); // Salı
    const a = await mkUser(10);
    const b = await mkUser(10);
    await pin.placePinBid({ userId: a.id, amount: 6, message: 'A', now: t0 });
    const nextWeek = new Date('2026-11-30T22:30:00Z'); // Pazartesi 01:30 İstanbul
    expect(await pin.currentPinLeader(nextWeek)).toBeNull();
    const r = await pin.placePinBid({ userId: b.id, amount: 1, message: 'B', now: nextWeek });
    expect(r.previous).toBeNull();
    expect(await prisma.pinBid.findFirstOrThrow({ where: { userId: a.id } })).toMatchObject({ status: 'COMPLETED', chargedAmount: 6, refundedAmount: 0 });
    expect(await credits(a.id)).toBe(4);
    expect(await prisma.creditTransaction.count({ where: { userId: a.id, type: 'PIN_REFUND' } })).toBe(0);
  });

  it('settleFinishedWeeks: biten haftanın liderini COMPLETED yapar (cron)', async () => {
    const t0 = new Date('2026-12-08T10:00:00Z');
    const a = await mkUser(5);
    await pin.placePinBid({ userId: a.id, amount: 2, message: 'A', now: t0 });
    expect(await pin.settleFinishedWeeks(new Date('2026-12-14T22:05:00Z'))).toBeGreaterThanOrEqual(1);
    expect(await prisma.pinBid.findFirstOrThrow({ where: { userId: a.id } })).toMatchObject({ status: 'COMPLETED' });
  });

  it('yönetici kaldırması: oransal iade, sıra boşalır (yeni teklif 1 krediden)', async () => {
    const t0 = new Date('2026-12-15T10:00:00Z');
    const a = await mkUser(10);
    const r = await pin.placePinBid({ userId: a.id, amount: 7, message: 'kaldırılacak', now: t0 });
    const out = await pin.removePinBid(r.bidId, new Date(t0.getTime() + 3 * H));
    expect(out).toMatchObject({ charged: 1, refunded: 6 });
    expect(await credits(a.id)).toBe(9);
    expect(await pin.currentPinLeader(t0)).toBeNull();
    await expect(pin.removePinBid(r.bidId, t0)).rejects.toMatchObject({ code: 'BID_NOT_ACTIVE' });
  });
});
