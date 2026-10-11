import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Tahmin oyunu uçları — kimlik, takma ad kapısı, gövde doğrulama, hız sınırı, önbellek başlıkları ve dağılımın başlama
 * öncesi kapalı olması. Servis katmanı taklit (asıl kilit / puan testleri PGlite'ta: test/pglite/predictionGame.pglite.test.ts).
 */
const h = vi.hoisted(() => ({
  userId: 'u1' as string | null,
  username: 'eren' as string | null,
  rl: { success: true, remaining: 1, resetAt: 0 },
  saved: [] as unknown[],
  saveResult: { items: [], joker: null, me: {} } as unknown,
  dist: { kind: 'locked' } as unknown,
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => h.rl), requestIp: () => '1.1.1.1' }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(async () => (h.userId ? { username: h.username } : null)) } } }));
vi.mock('@/server/game/play', async (orig) => {
  const real = await orig<typeof import('@/server/game/play')>();
  return {
    ...real,
    savePredictions: vi.fn(async (...a: unknown[]) => {
      h.saved.push(a);
      return h.saveResult;
    }),
    loadDistribution: vi.fn(async () => h.dist),
    loadLeaderboard: vi.fn(async (scope: string, key: string) => ({ scope, key, entries: [] })),
  };
});

import predictions from '@/pages/api/game/weeks/[weekKey]/predictions';
import distribution from '@/pages/api/game/matches/[id]/distribution';
import leaderboard from '@/pages/api/game/leaderboard/index';
import { parseSaveBody } from '@/server/game/play';

type Res = { statusCode: number; body: unknown; headers: Record<string, string> };
function call(handler: (q: NextApiRequest, s: NextApiResponse) => unknown, method: string, query: Record<string, string>, body?: unknown): Promise<Res> {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end() { return this; },
  };
  const req = { method, query, body, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

const ID = 'cmatch000000001';
const good = { items: [{ gameMatchId: ID, home: 2, away: 1 }], jokerGameMatchId: ID };

beforeEach(() => {
  vi.stubEnv('GAME_ENABLED', 'public'); // kapı ayrı testte (gameGate.test.ts)
  h.userId = 'u1';
  h.username = 'eren';
  h.rl = { success: true, remaining: 1, resetAt: 0 };
  h.saved = [];
  h.saveResult = { items: [], joker: null, me: {} };
});

describe('PUT /api/game/weeks/[weekKey]/predictions', () => {
  it('geçerli gövde servis katmanına gider; kişisel yanıt önbelleklenmez', async () => {
    const r = await call(predictions, 'PUT', { weekKey: '2026-W42' }, good);
    expect(r.statusCode).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(h.saved).toEqual([['u1', '2026-W42', good]]);
  });

  it('401 girişsiz · 403 takma adsız · 405 yanlış yöntem · 400 bozuk hafta / gövde · 429 hız', async () => {
    h.userId = null;
    expect((await call(predictions, 'PUT', { weekKey: '2026-W42' }, good)).statusCode).toBe(401);
    h.userId = 'u1';
    h.username = null;
    const nick = await call(predictions, 'PUT', { weekKey: '2026-W42' }, good);
    expect([nick.statusCode, (nick.body as { code: string }).code]).toEqual([403, 'NICKNAME_REQUIRED']);
    h.username = 'eren';
    expect((await call(predictions, 'POST', { weekKey: '2026-W42' }, good)).statusCode).toBe(405);
    expect((await call(predictions, 'PUT', { weekKey: '2026-42' }, good)).statusCode).toBe(400);
    expect((await call(predictions, 'PUT', { weekKey: '2026-W42' }, { items: [{ gameMatchId: ID, home: 16, away: 0 }] })).statusCode).toBe(400);
    h.rl = { success: false, remaining: 0, resetAt: Date.now() + 30_000 };
    expect((await call(predictions, 'PUT', { weekKey: '2026-W42' }, good)).statusCode).toBe(429);
    expect(h.saved).toEqual([]);
  });

  it('hafta tahmine kapalı → 404 WEEK_CLOSED', async () => {
    h.saveResult = null;
    const r = await call(predictions, 'PUT', { weekKey: '2026-W42' }, good);
    expect([r.statusCode, (r.body as { code: string }).code]).toEqual([404, 'WEEK_CLOSED']);
  });
});

describe('parseSaveBody', () => {
  it('kabul / ret', () => {
    expect(parseSaveBody(good)).toEqual(good);
    expect(parseSaveBody({ items: [], jokerGameMatchId: null })).toEqual({ items: [], jokerGameMatchId: null });
    expect(parseSaveBody({ items: [{ gameMatchId: ID, home: 1, away: 0 }] })).toEqual({ items: [{ gameMatchId: ID, home: 1, away: 0 }] });
    for (const bad of [
      null,
      {},
      { items: [] },
      { items: [{ gameMatchId: ID, home: 1, away: 0 }, { gameMatchId: ID, home: 2, away: 0 }] }, // aynı maç iki kez
      { items: [{ gameMatchId: 'x', home: 1, away: 0 }] },
      { items: [{ gameMatchId: ID, home: -1, away: 0 }] },
      { items: [{ gameMatchId: ID, home: 1.5, away: 0 }] },
      { items: [{ gameMatchId: ID, home: '1', away: 0 }] },
      { items: Array.from({ length: 11 }, (_, i) => ({ gameMatchId: `cmatch00000000${i}x`, home: 1, away: 0 })) },
      { items: [], jokerGameMatchId: 5 },
    ]) {
      expect(parseSaveBody(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('GET /api/game/matches/[id]/distribution', () => {
  it('başlamadan 403 LOCKED_UNTIL_KICKOFF; başlayınca CDN önbellekli', async () => {
    h.dist = { kind: 'locked' };
    const r = await call(distribution, 'GET', { id: ID });
    expect([r.statusCode, (r.body as { code: string }).code]).toEqual([403, 'LOCKED_UNTIL_KICKOFF']);
    h.dist = { kind: 'ok', view: { total: 3, shares: { home: 100, draw: 0, away: 0 }, top: [] } };
    const ok = await call(distribution, 'GET', { id: ID });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['Cache-Control']).toMatch(/^public, s-maxage=60/);
    expect((await call(distribution, 'GET', { id: '../x' })).statusCode).toBe(400);
  });
});

describe('GET /api/game/leaderboard', () => {
  it('kapsam + anahtar doğrulama', async () => {
    expect((await call(leaderboard, 'GET', { scope: 'week', key: '2026-W42' })).statusCode).toBe(200);
    expect((await call(leaderboard, 'GET', { scope: 'season', key: '2026-27' })).statusCode).toBe(200);
    expect((await call(leaderboard, 'GET', { scope: 'season', key: '2026-W42' })).statusCode).toBe(400);
    expect((await call(leaderboard, 'GET', { scope: 'all', key: '2026-27' })).statusCode).toBe(400);
  });
});
