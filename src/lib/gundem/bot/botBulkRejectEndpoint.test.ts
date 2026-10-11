import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('./fakeDraftDb.testutil');
  return { prisma: createFakeDb() };
});
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
const guard = vi.hoisted(() => ({ ok: true as boolean }));
vi.mock('@/lib/requireAuth', () => ({
  requireAdmin: vi.fn(async (_req: unknown, res: NextApiResponse) => {
    if (guard.ok) return { ok: true, userId: 'admin1' };
    res.status(403).json({ error: 'Yetkisiz.' });
    return { ok: false };
  }),
}));

import { prisma } from '@/lib/prisma';
import bulk from '@/pages/api/admin/gundem/drafts/bulk-reject';
import summary from '@/pages/api/admin/gundem/drafts/pending-summary';

const db = prisma as unknown as { gundemBotDraft: { create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }> }; __rows: () => any[]; __reset: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any

function run(h: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>, req: Partial<NextApiRequest>) {
  const out = { status: 200, body: undefined as unknown };
  const res = {
    setHeader: () => {},
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { return res; },
  } as unknown as NextApiResponse;
  return h({ method: 'POST', query: {}, headers: {}, ...req } as NextApiRequest, res).then(() => out);
}
let n = 0;
const seed = (status = 'PENDING') =>
  db.gundemBotDraft.create({ data: { externalKey: `k${++n}`, kind: 'GOAL', fixtureId: n, eventId: null, body: 'x', facts: { leagueName: 'Süper Lig' }, warnings: [], status } });

beforeEach(() => { guard.ok = true; db.__reset(); });

describe('POST /api/admin/gundem/drafts/bulk-reject', () => {
  it('POST dışı 405; admin değilse 403 ve hiçbir şey değişmez', async () => {
    expect((await run(bulk, { method: 'GET' })).status).toBe(405);
    await seed();
    guard.ok = false;
    expect((await run(bulk, { body: { all: true } })).status).toBe(403);
    expect(db.__rows()[0].status).toBe('PENDING');
  });

  it('geçersiz gövde 400', async () => {
    expect((await run(bulk, { body: {} })).status).toBe(400);
    expect((await run(bulk, { body: { all: true, ids: ['a'] } })).status).toBe(400);
  });

  it('dry-run yalnız sayı döner, yazmaz', async () => {
    await seed();
    await seed();
    await seed('POSTED');
    expect(await run(bulk, { body: { all: true, dryRun: true } })).toEqual({ status: 200, body: { count: 2 } });
    expect(db.__rows().filter((r) => r.status === 'REJECTED')).toHaveLength(0);
  });

  it('gerçek çalıştırma: yalnız PENDING reddedilir, yayınlanana dokunulmaz', async () => {
    const a = await seed();
    await seed('POSTED');
    const r = await run(bulk, { body: { ids: [a.id] } });
    expect(r).toEqual({ status: 200, body: { rejected: 1, skipped: 0 } });
    expect(db.__rows().map((x) => x.status)).toEqual(['REJECTED', 'POSTED']);
  });
});

describe('GET /api/admin/gundem/drafts/pending-summary', () => {
  it('admin zorunlu; toplam ve dağılım', async () => {
    await seed();
    await seed('POSTED');
    guard.ok = false;
    expect((await run(summary, { method: 'GET' })).status).toBe(403);
    guard.ok = true;
    expect(await run(summary, { method: 'GET' })).toEqual({
      status: 200,
      body: { total: 1, kinds: [{ kind: 'GOAL', count: 1 }], leagues: [{ name: 'Süper Lig', count: 1 }] },
    });
    expect((await run(summary, { method: 'POST' })).status).toBe(405);
  });
});
