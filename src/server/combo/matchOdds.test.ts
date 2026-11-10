import { describe, expect, it, vi } from 'vitest';
import { loadNationalMatchOdds } from './matchOdds';
import type { AfOddsEntry } from '@/services/apiFootball/oddsMarkets';
import natOdds from '@/services/apiFootball/__fixtures__/oddsNationalOnly1xBet_1528991.json';

vi.mock('@/lib/redis', () => ({ withRedis: async (_f: unknown, fb: unknown) => fb, getRedisClient: () => null, fitsInRedis: () => true }));

const entry = (natOdds as { response: AfOddsEntry[] }).response[0];

describe('loadNationalMatchOdds', () => {
  it('milli id → AF id ile tek istek; 1xBet oranları', async () => {
    const load = vi.fn(async () => ({ ok: true as const, entry }));
    const r = await loadNationalMatchOdds('2001528991', load);
    expect(load).toHaveBeenCalledWith(1528991);
    expect(r.ok && r.odds?.bookmaker).toBe('1xBet');
  });
  it('lig maçı id (< 2e9) → istek yok', async () => {
    const load = vi.fn();
    expect(await loadNationalMatchOdds('19172147', load as never)).toEqual({ ok: false, reason: 'not-national' });
    expect(load).not.toHaveBeenCalled();
  });
  it('oran açılmamış → odds null (kart gizli); AF hatası → error', async () => {
    expect(await loadNationalMatchOdds('2001545657', async () => ({ ok: true, entry: null }))).toEqual({ ok: true, odds: null });
    expect(await loadNationalMatchOdds('2001545657', async () => ({ ok: false }))).toEqual({ ok: false, reason: 'error' });
  });
});
