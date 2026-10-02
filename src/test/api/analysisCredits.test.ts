import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

/**
 * POST /api/matches/[id]/analysis — kredi güvenliği (veritabanı bellek içi sahte; bkz. fakeCreditDb.testutil.ts).
 * Senaryo 1–6: docs/ai-asistan-raporu.md bulgusu + kredi planı. Premium akışı ve Sportmonks hatası (503) ayrıca.
 */
const h = vi.hoisted(() => ({
  db: null as FakeCreditDb | null,
  aiCalls: 0,
  aiImpl: null as null | (() => Promise<unknown>),
  sportmonksFailed: false,
  ctxNull: false,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));
vi.mock('@/lib/requireAuth', () => ({
  requireAuth: async (req: NextApiRequest) => ({ ok: true, userId: String(req.headers['x-user']) }),
}));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: async () => ({ success: true, remaining: 9, resetAt: 0 }) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/predictionRecords', () => ({ ensurePredictionRecordForAnalysis: vi.fn() }));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), stale: false, failed: h.sportmonksFailed }),
}));
vi.mock('@/server/buildMatchAnalysisContext', () => ({
  buildMatchAnalysisContext: vi.fn(async (matchId: string) =>
    h.ctxNull
      ? null
      : {
          archived: false,
          matchPhase: 'PRE',
          match: { id: Number(matchId), competition: { id: 600, name: 'Süper Lig' } },
          homeTeam: { teamId: 34, teamName: 'Galatasaray' },
          awayTeam: { teamId: 88, teamName: 'Fenerbahçe' },
        },
  ),
}));
vi.mock('@/services/aiAnalysisService', () => {
  class AnalysisTimeoutError extends Error {}
  const result = () => {
    const t = { narrative: 'n' };
    return {
      analysis: {
        teamAnalyses: { home: t, away: t },
        matchPrediction: {},
        scorePrediction: {},
        goalExpectation: {},
        bettingTips: [],
        matchSummary: '',
        tacticalAnalysis: '',
        heatmapAnalysis: '',
        riskFactors: [],
        analystComment: '',
        riskLevel: 'low',
        riskReasoning: '',
        overallConfidence: 50,
      },
      modelVersion: 'test',
      tokensUsed: 1,
    };
  };
  return {
    AnalysisTimeoutError,
    generateMatchAnalysis: vi.fn(async () => {
      h.aiCalls += 1;
      if (h.aiImpl) await h.aiImpl();
      return result();
    }),
  };
});

import handler from '@/pages/api/matches/[id]/analysis';
import { AnalysisTimeoutError } from '@/services/aiAnalysisService';
import { PENDING_REFUND_AFTER_MS, addCredits, refundStalePendingSpends, settleCredits } from '@/lib/credits';

type Res = { statusCode: number; body: Record<string, unknown> };

function post(userId: string, matchId: string): Promise<Res> {
  const res = {
    statusCode: 200,
    body: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: Record<string, unknown>) {
      this.body = b;
      return this;
    },
    setHeader() {},
  };
  const req = { method: 'POST', query: { id: matchId }, headers: { 'x-user': userId } } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

/** AI çağrılarını elle bırakılana kadar bekletir (istekler aynı anda "uçuşta" kalsın). */
function holdAi() {
  const waiting: Array<() => void> = [];
  h.aiImpl = () => new Promise<void>((r) => waiting.push(r));
  return {
    get count() {
      return waiting.length;
    },
    releaseAll() {
      h.aiImpl = null;
      waiting.splice(0).forEach((r) => r());
    },
    releaseNext() {
      waiting.shift()?.();
    },
  };
}

async function until(cond: () => boolean) {
  for (let i = 0; i < 500 && !cond(); i++) await new Promise((r) => setImmediate(r));
  expect(cond()).toBe(true);
}

let db: FakeCreditDb;

/** Yalnız `Date` sahte (setImmediate / setTimeout gerçek): kod ve sahte DB aynı saati görür. */
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  db = createFakeCreditDb();
  h.db = db;
  h.aiCalls = 0;
  h.aiImpl = null;
  h.sportmonksFailed = false;
  h.ctxNull = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('kredi güvenliği — POST /api/matches/[id]/analysis', () => {
  it('Senaryo 1 — eşzamanlı düşüm: iki maç aynı anda; bakiye ve defter tutarlı, eksiye inmez', async () => {
    db.addUser('u1', 10);
    const ai = holdAi();
    const both = Promise.all([post('u1', '19000001'), post('u1', '19000002')]);
    await until(() => ai.count === 2);
    ai.releaseAll();
    const [a, b] = await both;

    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(db.balance('u1')).toBe(0); // eski kodda 5 kalırdı (kayıp güncelleme)
    const spends = db.ledgerOf('u1').filter((t) => t.type === 'ANALYSIS_SPEND');
    expect(spends.map((t) => t.balanceAfter).sort()).toEqual([0, 5]);
    expect(spends.every((t) => t.status === 'SETTLED')).toBe(true);
    expect(10 + db.ledgerSum('u1')).toBe(db.balance('u1'));

    // 5 kredisi olan kullanıcı iki maçı aynı anda isterse yalnız biri geçer; AI bir kez çağrılır.
    db.addUser('u2', 5);
    h.aiCalls = 0;
    const [c, d] = await Promise.all([post('u2', '19000003'), post('u2', '19000004')]);
    expect([c.statusCode, d.statusCode].sort()).toEqual([200, 402]);
    expect(db.balance('u2')).toBe(0);
    expect(h.aiCalls).toBe(1);
    expect(5 + db.ledgerSum('u2')).toBe(0);
  });

  it('Senaryo 2 — admin tanımıyla yarış: düşüm sürerken +50 kaybolmaz', async () => {
    db.addUser('u1', 10);
    const ai = holdAi();
    const pending = post('u1', '19000001');
    await until(() => ai.count === 1); // 5 düşüldü, analiz üretiliyor
    const [granted] = await Promise.all([addCredits('u1', 50, 'ADMIN_GRANT', 'test'), Promise.resolve(ai.releaseAll())]);
    const r = await pending;

    expect(r.statusCode).toBe(200);
    expect(granted).toBe(55);
    expect(db.balance('u1')).toBe(55); // eski kodda 5 (tanım kaybolurdu) ya da 60 (düşüm kaybolurdu)
    expect(10 + db.ledgerSum('u1')).toBe(55);

    // Eşzamanlı çok sayıda düşüm + tanım: son bakiye her zaman başlangıç + defter toplamı.
    db.addUser('u3', 0);
    await Promise.all([
      ...Array.from({ length: 10 }, () => addCredits('u3', 10, 'ADMIN_GRANT')),
      ...Array.from({ length: 5 }, (_, i) => post('u3', `1910000${i}`)),
    ]);
    expect(db.balance('u3')).toBe(db.ledgerSum('u3'));
    expect(db.balance('u3')).toBeGreaterThanOrEqual(0);

    // Negatif tanım bakiyenin altına inemez.
    await expect(addCredits('u1', -100, 'ADMIN_GRANT')).rejects.toThrow('Yetersiz kredi');
    expect(db.balance('u1')).toBe(55);
  });

  it('Senaryo 3 — çift tık / iki sekme: aynı kullanıcı aynı maç → tek düşüm, tek AI çağrısı', async () => {
    db.addUser('u1', 10);
    const ai = holdAi();
    const first = post('u1', '19000001');
    await until(() => ai.count === 1);
    const second = await post('u1', '19000001');

    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe('ANALYSIS_IN_PROGRESS');
    ai.releaseAll();
    expect((await first).statusCode).toBe(200);

    const third = await post('u1', '19000001'); // üretim bitti → ücretsiz
    expect(third.statusCode).toBe(200);
    expect(third.body.cached).toBe(true);

    expect(h.aiCalls).toBe(1);
    expect(db.balance('u1')).toBe(5);
    expect(db.ledgerOf('u1').filter((t) => t.type === 'ANALYSIS_SPEND')).toHaveLength(1);
  });

  it('Senaryo 4 — iki kullanıcı aynı maçı aynı anda üretir: kaybedene iade + kazananın analizi', async () => {
    db.addUser('a', 10);
    db.addUser('b', 10);
    const ai = holdAi();
    const pa = post('a', '19000001');
    const pb = post('b', '19000001');
    await until(() => ai.count === 2);
    ai.releaseNext(); // a önce kaydeder
    const ra = await pa;
    ai.releaseAll();
    const rb = await pb;

    expect(ra.statusCode).toBe(200);
    expect(ra.body.cached).toBe(false);
    expect(rb.statusCode).toBe(200);
    expect(rb.body.cached).toBe(true);
    expect((rb.body.analysis as { id: string }).id).toBe((ra.body.analysis as { id: string }).id);
    expect(db.analyses).toHaveLength(1);

    expect(db.balance('a')).toBe(5);
    expect(db.balance('b')).toBe(10);
    const bSpend = db.ledgerOf('b').find((t) => t.type === 'ANALYSIS_SPEND')!;
    const bRefund = db.ledgerOf('b').find((t) => t.type === 'REFUND')!;
    expect(bSpend.status).toBe('REFUNDED');
    expect(bRefund).toMatchObject({ amount: 5, balanceAfter: 10, refundOfId: bSpend.id, matchId: '19000001' });
  });

  it('Senaryo 5 — AI hatasında aynı istekte iade; anahtar serbest, tekrar denemede tek düşüm', async () => {
    db.addUser('u1', 10);
    h.aiImpl = async () => {
      throw new AnalysisTimeoutError();
    };
    const failed = await post('u1', '19000001');

    expect(failed.statusCode).toBe(504);
    expect(db.balance('u1')).toBe(10);
    const [spend, refund] = db.ledgerOf('u1');
    expect(spend).toMatchObject({ type: 'ANALYSIS_SPEND', amount: -5, status: 'REFUNDED' });
    expect(spend!.idempotencyKey).toBe(`analysis:19000001:PRE:refunded:${spend!.id}`);
    expect(refund).toMatchObject({ type: 'REFUND', amount: 5, balanceAfter: 10, refundOfId: spend!.id });

    // Şema / beklenmeyen hata da iade edilir.
    h.aiImpl = async () => {
      throw new Error('şema hatası');
    };
    expect((await post('u1', '19000001')).statusCode).toBe(500);
    expect(db.balance('u1')).toBe(10);

    h.aiImpl = null;
    const ok = await post('u1', '19000001');
    expect(ok.statusCode).toBe(200);
    expect(db.balance('u1')).toBe(5);
    expect(10 + db.ledgerSum('u1')).toBe(5);
  });

  it('Senaryo 6 — süresi geçen PENDING (fonksiyon öldü) iade edilir; bir kez, geç gelen settle geri çevirmez', async () => {
    db.addUser('u1', 10);
    // Ölen istek: düşüm yapıldı, analiz kaydedilemedi (AI hiç dönmedi).
    holdAi();
    void post('u1', '19000001');
    await until(() => db.ledgerOf('u1').some((t) => t.status === 'PENDING'));
    const dead = db.ledgerOf('u1')[0]!;
    expect(db.balance('u1')).toBe(5);

    advance(PENDING_REFUND_AFTER_MS - 1_000);
    expect(await refundStalePendingSpends()).toBe(0); // henüz 10 dk olmadı

    advance(2_000);
    expect(await refundStalePendingSpends()).toBe(1);
    expect(await refundStalePendingSpends()).toBe(0);
    expect(db.balance('u1')).toBe(10);
    expect(db.ledgerOf('u1').filter((t) => t.type === 'REFUND')).toHaveLength(1);
    expect(await settleCredits(dead.id)).toBe(false); // geç biten istek SETTLED yazamaz
    expect(db.ledgerOf('u1')[0]!.status).toBe('REFUNDED');
  });

  it('Senaryo 6b — kullanıcının sonraki isteği kendi yarım kalan harcamasını önce iade eder, aynı maç yeniden üretilebilir', async () => {
    db.addUser('u1', 10);
    holdAi();
    void post('u1', '19000001');
    await until(() => db.ledgerOf('u1').some((t) => t.status === 'PENDING'));

    advance(PENDING_REFUND_AFTER_MS + 1_000);
    h.aiImpl = null;
    const r = await post('u1', '19000001');

    expect(r.statusCode).toBe(200);
    expect(db.balance('u1')).toBe(5);
    expect(db.ledgerOf('u1').map((t) => [t.type, t.status])).toEqual([
      ['ANALYSIS_SPEND', 'REFUNDED'],
      ['REFUND', null],
      ['ANALYSIS_SPEND', 'SETTLED'],
    ]);
  });

  it('100+ kredili USER premium değil: 5 kredi düşülür; ADMIN krediden düşülmez, ANALYSIS_FREE kaydı yazılır', async () => {
    db.addUser('rich', 150);
    db.addUser('admin', 0, 'ADMIN');
    expect((await post('rich', '19000001')).statusCode).toBe(200);
    expect((await post('admin', '19000002')).statusCode).toBe(200);

    expect(db.balance('rich')).toBe(145);
    expect(db.balance('admin')).toBe(0);
    expect(db.ledger.map((t) => [t.userId, t.type, t.amount, t.status])).toEqual([
      ['rich', 'ANALYSIS_SPEND', -5, 'SETTLED'],
      ['admin', 'ANALYSIS_FREE', 0, null],
    ]);
  });

  it('Sportmonks geçici hatası (zaman aşımı / 5xx): 404 yerine 503, kredi düşülmez', async () => {
    db.addUser('u1', 10);
    h.sportmonksFailed = true;
    h.ctxNull = true;
    const r = await post('u1', '19000001');

    expect(r.statusCode).toBe(503);
    expect(r.body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(h.aiCalls).toBe(0);
    expect(db.balance('u1')).toBe(10);
    expect(db.ledger).toHaveLength(0);

    h.sportmonksFailed = false; // gerçekten yok → 404 kalır
    expect((await post('u1', '19000001')).statusCode).toBe(404);
  });

  it('yetersiz kredi: 402, bakiye ve defter değişmez', async () => {
    db.addUser('u1', 4);
    const r = await post('u1', '19000001');
    expect(r.statusCode).toBe(402);
    expect(db.balance('u1')).toBe(4);
    expect(db.ledger).toHaveLength(0);
    expect(h.aiCalls).toBe(0);
  });
});
