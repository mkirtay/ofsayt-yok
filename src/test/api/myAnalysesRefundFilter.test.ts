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

describe('AI Analizlerim — açma kayıtlarından (kredi modeli v2)', () => {
  it('kullanıcının açtıkları (LEGACY / CREDIT / WEEKLY_FREE) listede; iade edilen (açma yok) ve başkasınınki yok', async () => {
    db.addUser('u1', 10);
    for (const id of ['1', '2', '3', '4', '5']) {
      db.analyses.push({ id: `a${id}`, matchId: id, matchStatus: 'PRE', homeTeamName: 'H', awayTeamName: 'A' });
    }
    const unlock = (userId: string, n: string, source: string) =>
      db.unlocks.push({
        id: `ul-${userId}-${n}`,
        userId,
        matchAnalysisId: `a${n}`,
        matchId: n,
        source,
        creditTransactionId: null,
        createdAt: new Date(`2026-10-0${n}T12:00:00Z`),
      });
    unlock('u1', '1', 'LEGACY');
    unlock('u1', '2', 'CREDIT');
    unlock('u1', '4', 'WEEKLY_FREE');
    unlock('someone', '5', 'CREDIT');
    // a3: harcama iade edildi → açma kaydı hiç yazılmadı

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
    expect(res.body.items.map((i) => [i.matchId, (i as unknown as { source: string }).source]).sort()).toEqual([
      ['1', 'LEGACY'],
      ['2', 'CREDIT'],
      ['4', 'WEEKLY_FREE'],
    ]);
  });
});
