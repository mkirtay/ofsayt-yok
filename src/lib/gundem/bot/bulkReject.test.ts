import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('./fakeDraftDb.testutil');
  return { prisma: createFakeDb() };
});

import { prisma } from '@/lib/prisma';
import { BULK_REJECT_MAX_IDS, bulkRejectDrafts, bulkWhere, countBulkReject, loadPendingSummary, parseBulkBody, summarizePending } from './bulkReject';

type Fake = {
  gundemBotDraft: { create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }> };
  __rows: () => Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  __reset: () => void;
};
const db = prisma as unknown as Fake;

let n = 0;
const seed = (o: { status?: string; kind?: string; league?: string | null } = {}) =>
  db.gundemBotDraft.create({
    data: {
      externalKey: `k${++n}`,
      kind: o.kind ?? 'GOAL',
      fixtureId: n,
      eventId: null,
      body: 'x',
      facts: { leagueName: o.league === undefined ? 'Süper Lig' : o.league },
      warnings: [],
      status: o.status ?? 'PENDING',
    },
  });
const statuses = () => db.__rows().map((r) => r.status);

beforeEach(() => db.__reset());

describe('parseBulkBody', () => {
  it('tam olarak bir mod kabul eder', () => {
    expect(parseBulkBody({ ids: ['a', 'a', 'b'] })).toEqual({ ok: true, selector: { ids: ['a', 'b'] }, dryRun: false });
    expect(parseBulkBody({ all: true, dryRun: true })).toEqual({ ok: true, selector: { all: true }, dryRun: true });
    expect(parseBulkBody({ kind: 'GOAL', league: 'Süper Lig' })).toEqual({ ok: true, selector: { kind: 'GOAL', league: 'Süper Lig' }, dryRun: false });
    for (const bad of [{}, null, { ids: ['a'], all: true }, { all: true, kind: 'GOAL' }, { ids: ['a'], kind: 'GOAL' }]) {
      expect(parseBulkBody(bad).ok).toBe(false);
    }
  });

  it('geçersiz değerleri reddeder (boş/aşırı ids, all:false, bilinmeyen tür, boş lig)', () => {
    expect(parseBulkBody({ ids: [] }).ok).toBe(false);
    expect(parseBulkBody({ ids: Array.from({ length: BULK_REJECT_MAX_IDS + 1 }, (_, i) => `i${i}`) }).ok).toBe(false);
    expect(parseBulkBody({ ids: [1] }).ok).toBe(false);
    expect(parseBulkBody({ all: false }).ok).toBe(false);
    expect(parseBulkBody({ kind: 'DROP' }).ok).toBe(false);
    expect(parseBulkBody({ league: '  ' }).ok).toBe(false);
  });
});

describe('bulkWhere', () => {
  it('her seçici status: PENDING içerir', () => {
    for (const sel of [{ ids: ['a'] }, { all: true as const }, { kind: 'GOAL' }, { league: 'x' }]) expect(bulkWhere(sel).status).toBe('PENDING');
  });
});

describe('bulkRejectDrafts', () => {
  it('seçili kimlikler: yalnız PENDING reddedilir; yayınlanmış/eskimiş/zaten reddedilmiş dokunulmaz, skipped sayılır', async () => {
    const a = await seed();
    const b = await seed();
    const posted = await seed({ status: 'POSTED' });
    const stale = await seed({ status: 'STALE' });
    const rejected = await seed({ status: 'REJECTED' });
    const other = await seed(); // seçilmedi
    const r = await bulkRejectDrafts({ ids: [a.id, b.id, posted.id, stale.id, rejected.id, 'yok'] }, 'admin1');
    expect(r).toEqual({ rejected: 2, skipped: 4 });
    const by = Object.fromEntries(db.__rows().map((x) => [x.id, x]));
    expect(by[a.id]).toMatchObject({ status: 'REJECTED', decidedById: 'admin1' });
    expect(by[b.id].status).toBe('REJECTED');
    expect(by[posted.id]).toMatchObject({ status: 'POSTED', decidedById: null });
    expect(by[stale.id].status).toBe('STALE');
    expect(by[other.id].status).toBe('PENDING');
    expect(db.__rows()).toHaveLength(6); // silme yok
  });

  it('tümü: bütün PENDING reddedilir, diğer durumlar korunur', async () => {
    await seed();
    await seed();
    await seed({ status: 'POSTED' });
    await seed({ status: 'APPROVED' });
    expect(await bulkRejectDrafts({ all: true }, 'admin1')).toEqual({ rejected: 2, skipped: 0 });
    expect(statuses().sort()).toEqual(['APPROVED', 'POSTED', 'REJECTED', 'REJECTED']);
  });

  it('tür ve lig filtresi (ayrı ayrı ve birlikte)', async () => {
    await seed({ kind: 'GOAL', league: 'Süper Lig' });
    await seed({ kind: 'GOAL', league: 'La Liga' });
    await seed({ kind: 'PREVIEW', league: 'Süper Lig' });
    await seed({ kind: 'GOAL', league: 'Süper Lig', status: 'POSTED' });
    expect(await countBulkReject({ kind: 'GOAL', league: 'Süper Lig' })).toBe(1);
    expect(await countBulkReject({ kind: 'GOAL' })).toBe(2);
    expect(await countBulkReject({ league: 'Süper Lig' })).toBe(2);
    expect(await bulkRejectDrafts({ kind: 'GOAL', league: 'Süper Lig' }, 'a')).toEqual({ rejected: 1, skipped: 0 });
    expect(await countBulkReject({ all: true })).toBe(2);
    expect(db.__rows().find((r) => r.status === 'POSTED')).toBeTruthy();
  });

  it('dry-run sayımı yazmaz', async () => {
    await seed();
    expect(await countBulkReject({ all: true })).toBe(1);
    expect(statuses()).toEqual(['PENDING']);
  });
});

describe('pending summary', () => {
  it('tür ve lig dağılımı sayıya göre azalan; liga sahip olmayan satır lige girmez', async () => {
    expect(summarizePending([
      { kind: 'GOAL', facts: { leagueName: 'Süper Lig' } },
      { kind: 'GOAL', facts: { leagueName: 'Süper Lig' } },
      { kind: 'PREVIEW', facts: { leagueName: 'La Liga' } },
      { kind: 'RECAP', facts: null },
    ])).toEqual({
      total: 4,
      kinds: [{ kind: 'GOAL', count: 2 }, { kind: 'PREVIEW', count: 1 }, { kind: 'RECAP', count: 1 }],
      leagues: [{ name: 'Süper Lig', count: 2 }, { name: 'La Liga', count: 1 }],
    });
    await seed();
    await seed({ status: 'POSTED' });
    expect((await loadPendingSummary()).total).toBe(1);
  });
});
