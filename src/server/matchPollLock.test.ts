import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/liveScoreService', () => ({ getFixturesByDate: vi.fn(async () => []) }));

import { resolvePollLock } from './matchPollLock';

const NOW = Date.parse('2026-10-11T18:30:00Z');
const match = (id: number, over: Partial<Match> = {}): Match =>
  ({ id, status: 'NOT STARTED', time: '', date: '2026-10-11', scheduled: '19:00', home: {}, away: {}, ...over }) as Match;

function deps(lists: Record<string, Match[]>, startingAt: Date | null = null) {
  const fixturesByDate = vi.fn(async (d: string) => lists[d] ?? []);
  const snapshotStartingAt = vi.fn(async () => startingAt);
  return { fixturesByDate, snapshotStartingAt, now: () => NOW };
}

describe('resolvePollLock', () => {
  it('yalnız UTC dün + bugün listeleri okunur (yeni istek türü yok)', async () => {
    const d = deps({});
    await resolvePollLock('1', d);
    expect(d.fixturesByDate.mock.calls.map((c) => c[0]).sort()).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('gün listesindeki maç: durum + saat kararı, snapshot sorulmaz', async () => {
    const d = deps({ '2026-10-11': [match(1), match(2, { scheduled: '18:00' }), match(3, { status: 'IN PLAY', scheduled: '19:30' })] });
    expect(await resolvePollLock('1', d)).toEqual({ locked: false, source: 'day-list' });
    expect(await resolvePollLock('2', d)).toEqual({ locked: true, source: 'day-list' });
    expect(await resolvePollLock('3', d)).toEqual({ locked: true, source: 'day-list' });
    expect(d.snapshotStartingAt).not.toHaveBeenCalled();
  });

  it('dünkü listede bitmiş maç kilitli', async () => {
    const d = deps({ '2026-10-10': [match(9, { status: 'FINISHED', date: '2026-10-10' })] });
    expect(await resolvePollLock('9', d)).toEqual({ locked: true, source: 'day-list' });
  });

  it('listede yok → snapshot başlama saati; sınır dahil kilit', async () => {
    expect(await resolvePollLock('5', deps({}, new Date(NOW)))).toEqual({ locked: true, source: 'snapshot' });
    expect(await resolvePollLock('5', deps({}, new Date(NOW - 86_400_000 * 5)))).toEqual({ locked: true, source: 'snapshot' });
    expect(await resolvePollLock('5', deps({}, new Date(NOW + 1)))).toEqual({ locked: false, source: 'snapshot' });
  });

  it('hiç veri yok → açık (fail-open)', async () => {
    expect(await resolvePollLock('7', deps({}))).toEqual({ locked: false, source: 'none' });
  });
});
