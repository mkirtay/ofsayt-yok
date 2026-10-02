import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createFakeCreditDb, type FakeCreditDb } from '@/test/fakeCreditDb.testutil';

/** GET /api/credits/my-analyses — iade edilen harcama listede görünmez; eski (status null) kayıtlar görünür. */
const h = vi.hoisted(() => ({ db: null as FakeCreditDb | null }));

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t, k: string) => (h.db!.prisma as Record<string, unknown>)[k] }),
}));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: async () => 'u1' }));

import handler from '@/pages/api/credits/my-analyses';

let db: FakeCreditDb;

beforeEach(() => {
  db = createFakeCreditDb();
  h.db = db;
});

describe('AI Analizlerim — REFUNDED süzgeci', () => {
  it('REFUNDED harcama çıkar; status null (eski), SETTLED ve ANALYSIS_FREE kalır', async () => {
    db.addUser('u1', 10);
    const row = (matchId: string, type: string, status: string | null, amount = -5) =>
      db.ledger.push({
        id: `t-${matchId}`,
        userId: 'u1',
        type,
        amount,
        balanceAfter: 0,
        matchId,
        note: null,
        idempotencyKey: null,
        status,
        refundOfId: null,
        createdAt: new Date('2026-10-02T12:00:00Z'),
      });
    row('1', 'ANALYSIS_SPEND', null);
    row('2', 'ANALYSIS_SPEND', 'SETTLED');
    row('3', 'ANALYSIS_SPEND', 'REFUNDED');
    row('4', 'ANALYSIS_FREE', null, 0);
    for (const id of ['1', '2', '3', '4']) {
      db.analyses.push({ id: `a${id}`, matchId: id, matchStatus: 'PRE', homeTeamName: 'H', awayTeamName: 'A' });
    }

    const res = { statusCode: 0, body: {} as { items: Array<{ matchId: string }> }, headers: {} as Record<string, string> };
    const r = {
      status(c: number) {
        res.statusCode = c;
        return this;
      },
      json(b: typeof res.body) {
        res.body = b;
        return this;
      },
      setHeader(k: string, v: string) {
        res.headers[k] = v;
      },
    };
    await handler({ method: 'GET', query: {}, headers: {} } as unknown as NextApiRequest, r as unknown as NextApiResponse);

    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((i) => i.matchId).sort()).toEqual(['1', '2', '4']);
  });
});
