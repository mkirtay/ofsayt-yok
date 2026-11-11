import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { gundemBotDraft: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('./draftActions', () => ({ approveDraft: vi.fn() }));

import { AUTO_PUBLISH_ACTOR, autoPublishPending, isAutoPublishEnabled } from './autoPublish';

describe('otomatik yayın', () => {
  beforeEach(() => findMany.mockReset());

  it('bayrak yalnız 1/true', () => {
    expect(isAutoPublishEnabled('1')).toBe(true);
    expect(isAutoPublishEnabled(' TRUE ')).toBe(true);
    for (const v of [undefined, '', '0', 'yes']) expect(isAutoPublishEnabled(v)).toBe(false);
  });

  it('bekleyenleri onay yoluyla yayınlar; eskiyen (409) ve hatalı ayrı sayılır', async () => {
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const approve = vi.fn(async (id: string) =>
      id === 'a' ? { ok: true as const, draft: {} } : id === 'b' ? { ok: false as const, status: 409, error: 'eskidi' } : { ok: false as const, status: 500, error: 'x' },
    );
    expect(await autoPublishPending({ kinds: ['PREVIEW', 'RECAP'] }, approve)).toEqual({ posted: 1, stale: 1, failed: 1 });
    expect(approve).toHaveBeenCalledWith('a', AUTO_PUBLISH_ACTOR);
    expect(findMany.mock.calls[0][0].where).toEqual({ status: 'PENDING', kind: { in: ['PREVIEW', 'RECAP'] } });
  });

  it('gol: yalnız 3 dk – 30 dk yaşındaki taslaklar', async () => {
    findMany.mockResolvedValue([]);
    const now = Date.parse('2026-11-12T18:00:00Z');
    await autoPublishPending({ kinds: ['GOAL'], minAgeMs: 180_000, maxAgeMs: 1_800_000, now }, vi.fn());
    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ lte: new Date(now - 180_000), gte: new Date(now - 1_800_000) });
  });
});
