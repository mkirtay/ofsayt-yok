import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

const h = vi.hoisted(() => ({ db: null as FakeCreditDb | null }));
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));

import {
  WeeklyFreeUsedError,
  isoWeekKeyIstanbul,
  recordGenerationUnlock,
  unlockAsPrivileged,
  unlockWithCredit,
  unlockWithWeeklyFree,
  weeklyFreeIneligibility,
  weeklyFreeUsed,
} from './analysisUnlock';
import { DuplicateSpendError, InsufficientCreditsError, reserveCredits, analysisIdempotencyKey } from './credits';

let db: FakeCreditDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z')); // Cumartesi
  db = createFakeCreditDb();
  h.db = db;
});
afterEach(() => vi.useRealTimers());

describe('unlockWithCredit — hazır analiz 1 kredi', () => {
  it('tek işlem: bakiye −1, defter SETTLED −1 (106f818 anahtarı), açma CREDIT; ikinci açma ücretsiz', async () => {
    db.addUser('u1', 3);
    const a = db.addAnalysis('19000001');
    const r = await unlockWithCredit('u1', a);
    expect(r).toMatchObject({ source: 'CREDIT', charged: true, created: true, balanceAfter: 2 });
    expect(db.ledgerOf('u1')).toEqual([
      expect.objectContaining({ type: 'ANALYSIS_SPEND', amount: -1, balanceAfter: 2, status: 'SETTLED', idempotencyKey: analysisIdempotencyKey('19000001') }),
    ]);
    expect(db.unlocks).toEqual([expect.objectContaining({ userId: 'u1', matchAnalysisId: a.id, source: 'CREDIT', creditTransactionId: db.ledger[0]!.id })]);

    expect(await unlockWithCredit('u1', a)).toMatchObject({ charged: false, created: false });
    expect(db.balance('u1')).toBe(2);
  });

  it('çift tık / iki sekme eşzamanlı → tek düşüm, tek açma', async () => {
    db.addUser('u1', 5);
    const a = db.addAnalysis('19000001');
    const rs = await Promise.all([unlockWithCredit('u1', a), unlockWithCredit('u1', a), unlockWithCredit('u1', a)]);
    expect(rs.filter((r) => r.charged)).toHaveLength(1);
    expect(db.balance('u1')).toBe(4);
    expect(db.unlocks).toHaveLength(1);
    expect(5 + db.ledgerSum('u1')).toBe(4);
  });

  it('yetersiz bakiye → InsufficientCreditsError, hiçbir şey yazılmaz', async () => {
    db.addUser('u1', 0);
    const a = db.addAnalysis('19000001');
    await expect(unlockWithCredit('u1', a)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(db.ledger).toHaveLength(0);
    expect(db.unlocks).toHaveLength(0);
  });

  it('aynı kullanıcının o maç için süren (PENDING) üretimi varsa DuplicateSpendError — çift ödeme yok', async () => {
    db.addUser('u1', 5);
    await reserveCredits('u1', 1, { type: 'ANALYSIS_SPEND', matchId: '19000001', idempotencyKey: analysisIdempotencyKey('19000001') });
    const a = db.addAnalysis('19000001');
    await expect(unlockWithCredit('u1', a)).rejects.toBeInstanceOf(DuplicateSpendError);
    expect(db.balance('u1')).toBe(4);
  });
});

describe('haftalık ücretsiz açma', () => {
  it('haftada bir; bakiye değişmez; ikinci analiz aynı hafta reddedilir; yeni hafta yeniden', async () => {
    db.addUser('u1', 2, 'USER', { emailVerified: new Date('2026-09-01'), createdAt: new Date('2026-09-01') });
    const a1 = db.addAnalysis('19000001');
    const a2 = db.addAnalysis('19000002');
    expect(await weeklyFreeUsed('u1')).toBe(false);
    expect(await unlockWithWeeklyFree('u1', a1)).toMatchObject({ source: 'WEEKLY_FREE', charged: false, created: true });
    expect(await weeklyFreeUsed('u1')).toBe(true);
    expect(db.balance('u1')).toBe(2);
    expect(db.ledgerOf('u1')[0]).toMatchObject({ type: 'ANALYSIS_WEEKLY_FREE', amount: 0, idempotencyKey: 'weekly-free:2026-W40' });
    await expect(unlockWithWeeklyFree('u1', a2)).rejects.toBeInstanceOf(WeeklyFreeUsedError);
    // Aynı analiz tekrar: zaten açık (hak harcanmaz)
    expect(await unlockWithWeeklyFree('u1', a1)).toMatchObject({ created: false });

    vi.setSystemTime(new Date('2026-10-04T21:30:00Z')); // Pazartesi 00:30 TSİ → yeni hafta
    expect(await unlockWithWeeklyFree('u1', a2)).toMatchObject({ created: true });
  });

  it('eşzamanlı iki talep (farklı analizler) → yalnız biri', async () => {
    db.addUser('u1', 0, 'USER', { emailVerified: new Date('2026-09-01'), createdAt: new Date('2026-09-01') });
    const [a1, a2] = [db.addAnalysis('1'), db.addAnalysis('2')];
    const rs = await Promise.allSettled([unlockWithWeeklyFree('u1', a1), unlockWithWeeklyFree('u1', a2)]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.unlocks).toHaveLength(1);
  });

  it('uygunluk: doğrulanmamış e-posta, 24 saatten yeni hesap', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(weeklyFreeIneligibility({ emailVerified: null, createdAt: new Date('2026-01-01') }, now)).toBe('EMAIL_NOT_VERIFIED');
    expect(weeklyFreeIneligibility({ emailVerified: new Date(), createdAt: new Date('2026-10-02T13:00:00Z') }, now)).toBe('ACCOUNT_TOO_NEW');
    expect(weeklyFreeIneligibility({ emailVerified: new Date(), createdAt: new Date('2026-10-02T11:59:00Z') }, now)).toBeNull();
  });

  it('ISO hafta TSİ: Pazar 23:30 TSİ önceki hafta, Pazartesi 00:30 TSİ yeni hafta; yıl sınırı', () => {
    expect(isoWeekKeyIstanbul(Date.parse('2026-10-04T20:30:00Z'))).toBe('2026-W40');
    expect(isoWeekKeyIstanbul(Date.parse('2026-10-04T21:30:00Z'))).toBe('2026-W41');
    expect(isoWeekKeyIstanbul(Date.parse('2027-01-01T09:00:00Z'))).toBe('2026-W53');
    expect(isoWeekKeyIstanbul(Date.parse('2027-01-04T09:00:00Z'))).toBe('2027-W01');
  });
});

describe('premium / yönetici ve üretim sonrası açma', () => {
  it('premium: 0 tutarlı ANALYSIS_PREMIUM + açma; tekrar çağrı yeni satır yazmaz', async () => {
    db.addUser('p', 0);
    const a = db.addAnalysis('1');
    expect(await unlockAsPrivileged('p', a, 'PREMIUM')).toMatchObject({ source: 'PREMIUM', created: true });
    expect(await unlockAsPrivileged('p', a, 'PREMIUM')).toMatchObject({ created: false });
    expect(db.ledger.map((t) => [t.type, t.amount])).toEqual([['ANALYSIS_PREMIUM', 0]]);
    expect(db.balance('p')).toBe(0);
  });

  it('krediyle üretim: açma rezervasyon satırına bağlanır; yönetici üretimi ANALYSIS_FREE', async () => {
    db.addUser('u1', 2);
    const r = await reserveCredits('u1', 1, { type: 'ANALYSIS_SPEND', matchId: '9', idempotencyKey: analysisIdempotencyKey('9') });
    const a = db.addAnalysis('9');
    expect(await recordGenerationUnlock('u1', a, { reservationId: r.id })).toMatchObject({ source: 'CREDIT', created: true });
    expect(db.unlocks[0]!.creditTransactionId).toBe(r.id);

    db.addUser('admin', 0, 'ADMIN');
    expect(await recordGenerationUnlock('admin', a, { privileged: 'ADMIN' })).toMatchObject({ source: 'ADMIN' });
    expect(db.ledgerOf('admin')[0]).toMatchObject({ type: 'ANALYSIS_FREE', amount: 0 });
  });
});
