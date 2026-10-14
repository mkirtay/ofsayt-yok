import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

vi.mock('@/hooks/useLiveMatchUpdates', () => ({ useLiveMatchUpdates: () => {} }));

import { findMatchRetryingTransient, TRANSIENT_RETRY_DELAYS_MS } from './useMatchDetail';

const match = { id: 1 } as unknown as Match;
const ok = { match, events: [], fromFixture: false };
const transient = { match: null, events: [], fromFixture: false, transient: true };
const missing = { match: null, events: [], fromFixture: false };

function sequence(...results: (typeof ok | typeof transient | typeof missing)[]) {
  const find = vi.fn(async () => results.shift() ?? missing);
  return find;
}

describe('findMatchRetryingTransient — 429 / zaman aşımında "bulunamadı" yok', () => {
  it('geçici hata → bekleyip yeniden dener, maç gelince durur', async () => {
    const find = sequence(transient, transient, ok);
    const waits: number[] = [];
    const r = await findMatchRetryingTransient(find, TRANSIENT_RETRY_DELAYS_MS, async (ms) => void waits.push(ms));
    expect(r.match).toBe(match);
    expect(find).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([15_000, 30_000]);
  });

  it('kesin "yok" (transient değil) → hiç yeniden denemez', async () => {
    const find = sequence(missing);
    const wait = vi.fn(async () => {});
    const r = await findMatchRetryingTransient(find, TRANSIENT_RETRY_DELAYS_MS, wait);
    expect(r).toEqual(missing);
    expect(find).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('denemeler tükenir → son (geçici) sonuç döner; toplam 1 + 4 istek', async () => {
    const find = sequence(transient, transient, transient, transient, transient, ok);
    const r = await findMatchRetryingTransient(find, TRANSIENT_RETRY_DELAYS_MS, async () => {});
    expect(r.transient).toBe(true);
    expect(find).toHaveBeenCalledTimes(1 + TRANSIENT_RETRY_DELAYS_MS.length);
  });

  it('iptal (sayfadan çıkıldı) → beklemeden sonra istek atılmaz', async () => {
    let cancelled = false;
    const find = sequence(transient, ok);
    const r = await findMatchRetryingTransient(find, TRANSIENT_RETRY_DELAYS_MS, async () => void (cancelled = true), () => cancelled);
    expect(r.transient).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
  });
});
