import { beforeEach, describe, expect, it, vi } from 'vitest';

// fetchMatchStats / fetchMatchLineups hata fırlatır (SSR); getMatchStats / getMatchLineups eski davranış (hata → null).

const upstream = vi.hoisted(() => ({ impl: async (): Promise<unknown> => ({ data: null }) }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: () => upstream.impl() }));

import { fetchMatchLineups, fetchMatchStats, getMatchLineups, getMatchStats } from './liveScoreService';

describe('istatistik / kadro — geçici hata ile "veri yok" ayrımı', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('429 → fetch* fırlatır, get* null döner', async () => {
    upstream.impl = async () => {
      throw Object.assign(new Error('Too Many Requests'), { status: 429 });
    };
    await expect(fetchMatchStats('1')).rejects.toThrow();
    await expect(fetchMatchLineups('1')).rejects.toThrow();
    expect(await getMatchStats('1')).toBeNull();
    expect(await getMatchLineups('1')).toBeNull();
  });

  it('gerçekten veri yok → fetch* fırlatmaz', async () => {
    upstream.impl = async () => ({ data: null });
    await expect(fetchMatchLineups('1')).resolves.toBeNull();
    await fetchMatchStats('1'); // fırlatmaması yeterli
  });
});
