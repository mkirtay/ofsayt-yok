import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

/**
 * /api/matches/[id]/analysis — kredi modeli v2 (veritabanı bellek içi sahte; bkz. fakeCreditDb.testutil.ts).
 * Açma 1 kredi; her kullanıcı kendisi için açar, açtığı kalıcı açık; maç bitince herkese açık; haftalık ücretsiz
 * (yalnız hazır analiz); premium / yönetici ücretsiz. Kredi güvenliği senaryoları (106f818) 1 krediyle yeniden.
 */
const h = vi.hoisted(() => ({
  db: null as FakeCreditDb | null,
  aiCalls: 0,
  aiImpl: null as null | (() => Promise<unknown>),
  sportmonksFailed: false,
  ctxNull: false,
  phase: 'PRE' as string,
  finished: false,
  /** Redis kilidi: true → gerçek kilit (Map), false → Redis yok (fail-open, her istek kilidi alır). */
  redis: true,
  locks: new Set<string>(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));
vi.mock('@/lib/requireAuth', () => ({
  requireAuth: async (req: NextApiRequest) => ({ ok: true, userId: String(req.headers['x-user']) }),
}));
vi.mock('@/lib/mobileAuth', () => ({
  getRequestAuth: async (req: NextApiRequest) => (req.headers['x-user'] ? { id: String(req.headers['x-user']) } : null),
}));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: async () => ({ success: true, remaining: 9, resetAt: 0 }) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/predictionRecords', () => ({ ensurePredictionRecordForAnalysis: vi.fn() }));
vi.mock('@/lib/resolveLiveMatch', () => ({
  resolveSportmonksMatch: async () => ({ kind: 'found', match: { status: h.finished ? 'FINISHED' : 'NOT STARTED' } }),
}));
vi.mock('@/lib/analysisGenerationLock', () => ({
  acquireAnalysisLock: async (matchId: string) => {
    if (!h.redis) return { key: matchId, token: 'fail-open' };
    if (h.locks.has(matchId)) return null;
    h.locks.add(matchId);
    return { key: matchId, token: 't' };
  },
  releaseAnalysisLock: async (lock: { key: string; token: string } | null) => {
    if (lock && lock.token !== 'fail-open') h.locks.delete(lock.key);
  },
}));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  SPORTMONKS_TIMEOUT_MS: { page: 3000, api: 5000 },
  withSportmonksTimeout: async <T,>(_ms: number, fn: () => Promise<T>) => fn(),
  trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), stale: false, failed: h.sportmonksFailed }),
}));
vi.mock('@/server/buildMatchAnalysisContext', () => ({
  buildMatchAnalysisContext: vi.fn(async (matchId: string) =>
    h.ctxNull
      ? null
      : {
          archived: false,
          matchPhase: h.phase,
          match: { id: Number(matchId), competition: { id: 600, name: 'Süper Lig' } },
          homeTeam: { teamId: 34, teamName: 'Galatasaray' },
          awayTeam: { teamId: 88, teamName: 'Fenerbahçe' },
        },
  ),
}));
vi.mock('@/services/aiAnalysisService', () => {
  class AnalysisTimeoutError extends Error {}
  const t = { narrative: 'GİZLİ ANLATI' };
  const result = () => ({
    analysis: {
      teamAnalyses: { home: t, away: t },
      matchPrediction: { home: 58, draw: 24, away: 18 },
      scorePrediction: { home: 2, away: 1 },
      goalExpectation: {},
      scenarios: [{ metric: 'GİZLİ SENARYO', probability: 60, confidence: 'medium', reasoning: 'r' }],
      matchSummary: { tempo: 'Yüksek tempo bekleniyor.', dominantSide: 'Ev sahibi baskın.' },
      tacticalAnalysis: 'GİZLİ TAKTİK',
      heatmapAnalysis: '',
      riskFactors: [],
      analystComment: 'GİZLİ YORUM',
      riskLevel: 'low',
      riskReasoning: '',
      overallConfidence: 50,
    },
    modelVersion: 'v4',
    tokensUsed: 1,
  });
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

type Res = { statusCode: number; body: Record<string, unknown>; headers: Record<string, string> };

function call(method: 'GET' | 'POST', userId: string | null, matchId: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<Res> {
  const out: Res = { statusCode: 200, body: {}, headers: {} };
  const res = {
    status(c: number) {
      out.statusCode = c;
      return this;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
    },
  };
  const req = {
    method,
    query: { id: matchId, ...(opts.query ?? {}) },
    headers: userId ? { 'x-user': userId } : {},
    body: opts.body,
  } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => out);
}
const post = (u: string, m: string, body?: unknown) => call('POST', u, m, { body });
const getV2 = (u: string | null, m: string) => call('GET', u, m, { query: { v: '2' } });

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

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const VERIFIED_OLD = { emailVerified: new Date('2026-09-01'), createdAt: new Date('2026-09-01') };

let db: FakeCreditDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  db = createFakeCreditDb();
  h.db = db;
  h.aiCalls = 0;
  h.aiImpl = null;
  h.sportmonksFailed = false;
  h.ctxNull = false;
  h.phase = 'PRE';
  h.finished = false;
  h.redis = true;
  h.locks.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('v2 — hazır analizi açma ve okuma', () => {
  it('hazır analiz: kilitli önizleme (kilitli alan yok) → 1 krediyle açılır → kalıcı açık, ikinci açma ücretsiz', async () => {
    db.addUser('gen', 5);
    db.addUser('u1', 3);
    await post('gen', '19000001'); // başka kullanıcı üretti

    const locked = await getV2('u1', '19000001');
    expect(locked.statusCode).toBe(200);
    expect(locked.headers['cache-control']).toBe('private, no-store');
    expect(locked.body.access).toBe('locked');
    expect(locked.body.preview).toEqual({
      homeTeamName: 'Galatasaray',
      awayTeamName: 'Fenerbahçe',
      summary: ['Yüksek tempo bekleniyor.', 'Ev sahibi baskın.'],
      top: { outcome: 'HOME', pct: 58 },
    });
    expect(locked.body.offer).toMatchObject({ cost: 1, signedIn: true, balance: 3, free: false });
    expect(JSON.stringify(locked.body)).not.toMatch(/GİZLİ|scorePrediction|teamAnalyses|scenarios/);

    const opened = await post('u1', '19000001');
    expect(opened.statusCode).toBe(200);
    expect(opened.body).toMatchObject({ cached: true, unlock: { source: 'CREDIT', charged: true }, credits: 2 });
    expect(h.aiCalls).toBe(1);
    expect(db.balance('u1')).toBe(2);

    expect((await getV2('u1', '19000001')).body.access).toBe('unlocked');
    expect((await post('u1', '19000001')).body).toMatchObject({ unlock: { charged: false }, credits: 2 });
    expect(db.balance('u1')).toBe(2);
  });

  it('eski istemci (parametresiz GET): erişim yoksa 404, açınca tam analiz (bugünkü şekil)', async () => {
    db.addUser('gen', 5);
    db.addUser('u1', 3);
    await post('gen', '19000001');
    expect((await call('GET', 'u1', '19000001')).statusCode).toBe(404);
    expect((await call('GET', 'u1', '19000001', { query: { optional: '1' } })).body).toEqual({ analysis: null, predictionRecord: null });
    await post('u1', '19000001'); // eski uygulama gövdesiz POST
    const full = await call('GET', 'u1', '19000001');
    expect(full.statusCode).toBe(200);
    expect(Object.keys(full.body).sort()).toEqual(['analysis', 'predictionRecord']);
  });

  it('maç bitince herkese (girişsiz dahil) tam analiz, kredi yok', async () => {
    db.addUser('gen', 5);
    db.addUser('u1', 0);
    await post('gen', '19000001');
    h.finished = true;
    expect((await getV2(null, '19000001')).body.access).toBe('free');
    expect((await call('GET', null, '19000001')).statusCode).toBe(200);
    const r = await post('u1', '19000001');
    expect(r.statusCode).toBe(200);
    expect(db.balance('u1')).toBe(0);
    expect(db.unlocks.filter((u) => u.userId === 'u1')).toHaveLength(0);
  });

  it('analiz yoksa: v2 access none; eski istemci 404', async () => {
    expect((await getV2(null, '19000009')).body).toMatchObject({ access: 'none', offer: { signedIn: false } });
    expect((await call('GET', null, '19000009')).statusCode).toBe(404);
  });

  it('eski (LEGACY) açma kaydı olan kullanıcıya tam analiz', async () => {
    db.addUser('gen', 5);
    db.addUser('old', 0);
    await post('gen', '19000001');
    db.unlocks.push({
      id: 'legacy_x',
      userId: 'old',
      matchAnalysisId: db.analyses[0]!.id,
      matchId: '19000001',
      source: 'LEGACY',
      creditTransactionId: null,
      createdAt: new Date(),
    });
    expect((await getV2('old', '19000001')).body).toMatchObject({ access: 'unlocked', unlockSource: 'LEGACY' });
  });
});

describe('v2 — haftalık ücretsiz, premium, yönetici', () => {
  it('haftalık: hazır analizde ücretsiz; aynı hafta ikinci → 409; analiz yoksa 409 NOT_READY; yeni / doğrulanmamış hesap 403', async () => {
    db.addUser('gen', 5);
    db.addUser('u1', 0, 'USER', VERIFIED_OLD);
    await post('gen', '19000001');
    await post('gen', '19000002');

    expect((await getV2('u1', '19000001')).body.offer).toMatchObject({ weeklyFree: { available: true, reason: null } });
    const r = await post('u1', '19000001', { method: 'weekly_free' });
    expect(r.body).toMatchObject({ unlock: { source: 'WEEKLY_FREE', charged: false } });
    expect(db.balance('u1')).toBe(0);
    expect((await getV2('u1', '19000002')).body.offer).toMatchObject({ weeklyFree: { available: false, reason: 'USED' } });
    expect((await post('u1', '19000002', { method: 'weekly_free' })).body.code).toBe('WEEKLY_FREE_USED');
    expect((await post('u1', '19000003', { method: 'weekly_free' })).body.code).toBe('WEEKLY_FREE_NOT_READY');
    expect(h.aiCalls).toBe(2);

    db.addUser('new', 0, 'USER', { emailVerified: new Date(), createdAt: new Date() });
    const tooNew = await post('new', '19000002', { method: 'weekly_free' });
    expect([tooNew.statusCode, tooNew.body.code, tooNew.body.reason]).toEqual([403, 'WEEKLY_FREE_NOT_ELIGIBLE', 'ACCOUNT_TOO_NEW']);
    db.addUser('unverified', 0, 'USER', { createdAt: new Date('2026-01-01') });
    expect((await post('unverified', '19000002', { method: 'weekly_free' })).body.reason).toBe('EMAIL_NOT_VERIFIED');
  });

  it('premium: açma ve üretim kredisiz (açtıkları premium bitince de açık); süresi geçmiş premium öder; yönetici kredisiz', async () => {
    db.addUser('p', 0, 'USER', { premiumUntil: new Date('2026-11-01') });
    expect((await post('p', '19000001')).statusCode).toBe(200); // üretim
    db.addUser('gen', 5);
    await post('gen', '19000002');
    expect((await post('p', '19000002')).body).toMatchObject({ unlock: { source: 'PREMIUM', charged: false } });
    expect(db.balance('p')).toBe(0);

    vi.setSystemTime(new Date('2026-12-01T12:00:00Z')); // premium bitti
    db.users.get('p')!.premiumUntil = new Date('2026-11-01');
    expect((await getV2('p', '19000002')).body.access).toBe('unlocked');
    expect((await post('p', '19000003')).statusCode).toBe(402);

    db.addUser('admin', 0, 'ADMIN');
    expect((await post('admin', '19000002')).body).toMatchObject({ unlock: { source: 'ADMIN' } });
    expect(db.ledgerOf('p').map((t) => t.type)).toEqual(['ANALYSIS_PREMIUM', 'ANALYSIS_PREMIUM']);
  });
});

describe('kredi güvenliği (106f818 senaryoları, 1 kredi)', () => {
  it('Senaryo 1 — eşzamanlı düşüm: iki maç aynı anda; bakiye ve defter tutarlı, eksiye inmez', async () => {
    db.addUser('u1', 2);
    const ai = holdAi();
    const both = Promise.all([post('u1', '19000001'), post('u1', '19000002')]);
    await until(() => ai.count === 2);
    ai.releaseAll();
    const [a, b] = await both;
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(db.balance('u1')).toBe(0);
    expect(2 + db.ledgerSum('u1')).toBe(0);

    db.addUser('u2', 1);
    h.aiCalls = 0;
    const [c, d] = await Promise.all([post('u2', '19000003'), post('u2', '19000004')]);
    expect([c.statusCode, d.statusCode].sort()).toEqual([200, 402]);
    expect(db.balance('u2')).toBe(0);
    expect(h.aiCalls).toBe(1);
  });

  it('Senaryo 2 — admin tanımıyla yarış: üretim sürerken +50 kaybolmaz; negatif tanım bakiyenin altına inemez', async () => {
    db.addUser('u1', 10);
    const ai = holdAi();
    const pending = post('u1', '19000001');
    await until(() => ai.count === 1);
    const [granted] = await Promise.all([addCredits('u1', 50, 'ADMIN_GRANT', 'test'), Promise.resolve(ai.releaseAll())]);
    expect((await pending).statusCode).toBe(200);
    expect(granted).toBe(59);
    expect(db.balance('u1')).toBe(59);
    expect(10 + db.ledgerSum('u1')).toBe(59);
    await expect(addCredits('u1', -100, 'ADMIN_GRANT')).rejects.toThrow('Yetersiz kredi');
  });

  it('Senaryo 3 — çift tık / iki sekme: üretim sürerken ikinci istek kredi ayrılmadan 409; sonra açık, tek düşüm', async () => {
    db.addUser('u1', 5);
    const ai = holdAi();
    const first = post('u1', '19000001');
    await until(() => ai.count === 1);
    const second = await post('u1', '19000001');
    expect([second.statusCode, second.body.code]).toEqual([409, 'ANALYSIS_IN_PROGRESS']);
    ai.releaseAll();
    expect((await first).statusCode).toBe(200);
    expect((await post('u1', '19000001')).body).toMatchObject({ unlock: { charged: false } });
    expect(h.aiCalls).toBe(1);
    expect(db.balance('u1')).toBe(4);
  });

  it('Senaryo 4a — iki kullanıcı, Redis kilidi var: ikinci 409 (ücretsiz), hazır olunca 1 krediyle açar', async () => {
    db.addUser('a', 5);
    db.addUser('b', 5);
    const ai = holdAi();
    const pa = post('a', '19000001');
    await until(() => ai.count === 1);
    expect((await post('b', '19000001')).body.code).toBe('ANALYSIS_IN_PROGRESS');
    expect(db.balance('b')).toBe(5);
    ai.releaseAll();
    await pa;
    expect((await post('b', '19000001')).body).toMatchObject({ unlock: { source: 'CREDIT', charged: true } });
    expect([db.balance('a'), db.balance('b')]).toEqual([4, 4]);
    expect(db.analyses).toHaveLength(1);
    expect(h.aiCalls).toBe(1);
  });

  it('Senaryo 4b — iki kullanıcı, Redis yok (kilit fail-open): ikisi de üretir, ikisi de 1 kredi öder ve açar, iade yok', async () => {
    h.redis = false;
    db.addUser('a', 5);
    db.addUser('b', 5);
    const ai = holdAi();
    const pa = post('a', '19000001');
    const pb = post('b', '19000001');
    await until(() => ai.count === 2);
    ai.releaseNext();
    const ra = await pa;
    ai.releaseAll();
    const rb = await pb;
    expect([ra.statusCode, rb.statusCode]).toEqual([200, 200]);
    expect(rb.body.cached).toBe(true);
    expect((rb.body.analysis as { id: string }).id).toBe((ra.body.analysis as { id: string }).id);
    expect(db.analyses).toHaveLength(1);
    expect([db.balance('a'), db.balance('b')]).toEqual([4, 4]);
    expect(db.ledger.filter((t) => t.type === 'REFUND')).toHaveLength(0);
    expect(db.unlocks.map((u) => u.userId).sort()).toEqual(['a', 'b']);
  });

  it('Senaryo 5 — AI hatasında aynı istekte iade; anahtar serbest, tekrar denemede tek düşüm', async () => {
    db.addUser('u1', 3);
    h.aiImpl = async () => {
      throw new AnalysisTimeoutError();
    };
    expect((await post('u1', '19000001')).statusCode).toBe(504);
    expect(db.balance('u1')).toBe(3);
    const [spend, refund] = db.ledgerOf('u1');
    expect(spend).toMatchObject({ type: 'ANALYSIS_SPEND', amount: -1, status: 'REFUNDED' });
    expect(refund).toMatchObject({ type: 'REFUND', amount: 1, refundOfId: spend!.id });
    h.aiImpl = null;
    expect((await post('u1', '19000001')).statusCode).toBe(200);
    expect(db.balance('u1')).toBe(2);
    expect(db.unlocks).toHaveLength(1);
  });

  it('Senaryo 6 — süresi geçen PENDING (fonksiyon öldü) iade edilir; bir kez; geç gelen settle geri çevirmez', async () => {
    db.addUser('u1', 3);
    holdAi();
    void post('u1', '19000001');
    await until(() => db.ledgerOf('u1').some((t) => t.status === 'PENDING'));
    const dead = db.ledgerOf('u1')[0]!;
    advance(PENDING_REFUND_AFTER_MS - 1_000);
    expect(await refundStalePendingSpends()).toBe(0);
    advance(2_000);
    expect(await refundStalePendingSpends()).toBe(1);
    expect(await refundStalePendingSpends()).toBe(0);
    expect(db.balance('u1')).toBe(3);
    expect(await settleCredits(dead.id)).toBe(false);
  });

  it('yetersiz kredi: 402, bakiye ve defter değişmez; Sportmonks geçici hatası 503', async () => {
    db.addUser('u1', 0);
    expect((await post('u1', '19000001')).statusCode).toBe(402);
    expect(db.ledger).toHaveLength(0);
    h.sportmonksFailed = true;
    h.ctxNull = true;
    db.addUser('u2', 5);
    expect((await post('u2', '19000002')).body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(db.balance('u2')).toBe(5);
  });
});
