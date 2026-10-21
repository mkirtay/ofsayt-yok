import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import roundSl8 from '@/services/sportmonks/__fixtures__/roundStatisticsSuperLig8.json';
import stagesSl from '@/services/sportmonks/__fixtures__/stagesSeasonSuperLig.json';
import stagesUcl from '@/services/sportmonks/__fixtures__/stagesSeasonUcl.json';
import stageUclPo from '@/services/sportmonks/__fixtures__/stageStatisticsUclPlayoffs.json';

/** Haftanın Özeti sunucu servisi + uç: Sportmonks istemcisi ve SWR taklit; istek sayısı / hata ≠ veri yok. */
const h = vi.hoisted(() => ({
  calls: [] as { path: string; include?: string }[],
  fail: null as string | null,
  emptyStats: false,
}));

vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_base: string, path: string, params?: { include?: string }) => {
    h.calls.push({ path, include: params?.include });
    if (h.fail && path.startsWith(h.fail)) throw new Error('Sportmonks 500');
    if (path === '/leagues/600') return { data: { id: 600, seasons: [{ id: 28203 }, { id: 25749 }] } };
    if (path === '/leagues/2') return { data: { id: 2, seasons: [{ id: 28155 }] } };
    if (path === '/stages/seasons/28203') return stagesSl;
    if (path === '/stages/seasons/28155') return stagesUcl;
    if (h.emptyStats) return { data: [] };
    if (path.startsWith('/statistics/rounds/')) return roundSl8;
    if (path.startsWith('/statistics/stages/')) return stageUclPo;
    throw new Error(`beklenmeyen ${path}`);
  }),
}));
vi.mock('@/server/swrCache', () => ({
  loadWithSwr: async (_key: string, _opts: unknown, compute: () => Promise<unknown>) => {
    const v = await compute();
    return v == null ? null : { value: v, state: 'computed' };
  },
}));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })), requestIp: () => '1.1.1.1' }));

import { loadRoundStats, roundStatsSwrOptions, RoundStatsInputError, ROUND_STATS_INCLUDE } from './roundStats';
import handler from '@/pages/api/leagues/round-stats';
import { sportmonksCacheTtl } from '@/services/sportmonks/cachePolicy';
import { checkProxyAllowlist } from '@/server/sportmonks/proxyAllowlist';

const NOW = Date.UTC(2026, 9, 21, 9, 0); // 21 Ekim 2026 12:00 TSİ

beforeEach(() => {
  h.calls = [];
  h.fail = null;
  h.emptyStats = false;
});

describe('loadRoundStats', () => {
  it('Süper Lig varsayılanı: son tamamlanan hafta (8), 3 istek', async () => {
    const p = await loadRoundStats(600, 28203, null, NOW);
    expect(p.mode).toBe('rounds');
    expect(p.selected).toBe('r410383');
    expect(p.units).toHaveLength(8);
    expect(p.summary?.goals.total).toBe(23);
    expect(h.calls).toEqual([
      { path: '/leagues/600', include: 'seasons' },
      { path: '/stages/seasons/28203', include: 'rounds:name,starting_at,ending_at' },
      { path: '/statistics/rounds/410383', include: ROUND_STATS_INCLUDE },
    ]);
  });

  it('Şampiyonlar Ligi: aşama modu, statistics/stages', async () => {
    const p = await loadRoundStats(2, 28155, 's77483291', NOW);
    expect(p.mode).toBe('stages');
    expect(p.selected).toBe('s77483291');
    expect(h.calls.at(-1)?.path).toBe('/statistics/stages/77483291');
  });

  it('lig planda değil / sezon başka ligin / birim o sezonda değil → giriş hatası, istatistik isteği yok', async () => {
    await expect(loadRoundStats(999, 28203, null, NOW)).rejects.toBeInstanceOf(RoundStatsInputError);
    await expect(loadRoundStats(600, 28155, null, NOW)).rejects.toBeInstanceOf(RoundStatsInputError);
    // 9. hafta henüz başlamadı (23 Ekim) → seçilemez
    await expect(loadRoundStats(600, 28203, 'r410382', NOW)).rejects.toBeInstanceOf(RoundStatsInputError);
    expect(h.calls.some((c) => c.path.startsWith('/statistics/'))).toBe(false);
  });

  it('boş istatistik → summary null (veri yok); Sportmonks hatası → fırlatır (hata ≠ veri yok)', async () => {
    h.emptyStats = true;
    expect((await loadRoundStats(600, 28203, null, NOW)).summary).toBeNull();
    h.emptyStats = false;
    h.fail = '/statistics/';
    await expect(loadRoundStats(600, 28203, null, NOW)).rejects.toThrow('Sportmonks 500');
  });

  it('SWR süresi: bitişinden 2 gün geçmiş hafta 7 gün, yeni biten / süren 2 sa', () => {
    expect(roundStatsSwrOptions({ end: '2026-10-19' }, '2026-10-21').freshSeconds).toBe(7 * 86400);
    expect(roundStatsSwrOptions({ end: '2026-10-20' }, '2026-10-21').freshSeconds).toBe(7200);
    expect(roundStatsSwrOptions({ end: null }, '2026-10-21').freshSeconds).toBe(7200);
  });
});

describe('önbellek / izin listesi', () => {
  it('statistics/rounds|stages ham kaydı 1 sa taze, 7 gün saklanır', () => {
    expect(sportmonksCacheTtl('football/statistics/rounds/410383', [])).toEqual({ fresh: 3600, stale: 7 * 86400 });
    expect(sportmonksCacheTtl('football/statistics/stages/77484090', [])).toEqual({ fresh: 3600, stale: 7 * 86400 });
  });

  it('tarayıcı proxy\'si statistics / stages uçlarını AÇMAZ: veri yalnız doğrulamalı sunucu ucundan (lig/sezon/birim kontrolü)', () => {
    expect(checkProxyAllowlist('football/statistics/rounds/410383', { include: 'participant' }).allowed).toBe(false);
    expect(checkProxyAllowlist('football/stages/seasons/28203', { include: 'rounds' }).allowed).toBe(false);
  });
});

function get(query: Record<string, string>) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  const req = { method: 'GET', query, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('GET /api/leagues/round-stats', () => {
  it('200 + CDN önbelleği', async () => {
    const res = await get({ league: '600', season: '28203' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toMatch(/^public, s-maxage=/);
    expect((res.body as { selected: string }).selected).toMatch(/^r\d+$/);
  });

  it('geçersiz parametre 400, isteğe gitmez', async () => {
    for (const q of [{ league: 'x', season: '1' }, { league: '600', season: '28203', unit: 'q1' }, { league: '600' }]) {
      expect((await get(q as Record<string, string>)).statusCode).toBe(400);
    }
    expect(h.calls).toEqual([]);
  });

  it('Sportmonks hatası 502 no-store', async () => {
    h.fail = '/stages/';
    const res = await get({ league: '600', season: '28203' });
    expect(res.statusCode).toBe(502);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
