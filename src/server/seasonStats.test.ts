import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import seasonSl from '@/services/sportmonks/__fixtures__/seasonStatisticsSuperLig.json';

/** Sezon Özeti sunucu servisi + uç: Sportmonks istemcisi taklit; doğrulama sırası / istek sayısı / hata ≠ veri yok. */
const h = vi.hoisted(() => ({
  calls: [] as { path: string; include?: string }[],
  fail: null as string | null,
  season: null as unknown,
}));

vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_base: string, path: string, params?: { include?: string }) => {
    h.calls.push({ path, include: params?.include });
    if (h.fail && path.startsWith(h.fail)) throw new Error('Sportmonks 500');
    if (path === '/leagues/600') return { data: { id: 600, seasons: [{ id: 28203 }, { id: 25749 }] } };
    if (path === '/leagues/2') return { data: { id: 2, seasons: [{ id: 28155 }] } };
    if (path === '/seasons/28203') return h.season ?? seasonSl;
    if (path === '/seasons/25749') return { data: { id: 25749, name: '2025/2026', finished: true, statistics: [] } };
    throw new Error(`beklenmeyen ${path}`);
  }),
}));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })), requestIp: () => '1.1.1.1' }));

import { loadSeasonStats, SeasonStatsInputError } from './seasonStats';
import handler from '@/pages/api/leagues/season-stats';
import { checkProxyAllowlist } from '@/server/sportmonks/proxyAllowlist';

const NOW = Date.UTC(2026, 9, 21, 9, 0);

beforeEach(() => {
  h.calls = [];
  h.fail = null;
  h.season = null;
});

describe('loadSeasonStats', () => {
  it('Süper Lig: lig doğrulaması (paylaşımlı anahtar) + tek sezon isteği', async () => {
    const p = await loadSeasonStats(600, 28203, NOW);
    expect(p.season).toEqual({ id: 28203, name: '2026/2027', finished: false });
    expect(p.summary?.played).toBe(72);
    expect(h.calls).toEqual([
      { path: '/leagues/600', include: 'seasons' },
      { path: '/seasons/28203', include: 'statistics.participant' },
    ]);
  });

  it('lig planda değil / sezon başka ligin → giriş hatası, sezon isteği YOK (rastgele id kota yakmaz)', async () => {
    await expect(loadSeasonStats(999, 28203, NOW)).rejects.toBeInstanceOf(SeasonStatsInputError);
    await expect(loadSeasonStats(600, 28155, NOW)).rejects.toBeInstanceOf(SeasonStatsInputError);
    await expect(loadSeasonStats(600, 123456789, NOW)).rejects.toBeInstanceOf(SeasonStatsInputError);
    expect(h.calls.some((c) => c.path.startsWith('/seasons/'))).toBe(false);
  });

  it('istatistiksiz / "sonuç yok" sezon → summary null; biten sezon finished', async () => {
    const p = await loadSeasonStats(600, 25749, NOW);
    expect(p.summary).toBeNull();
    expect(p.season.finished).toBe(true);
    h.season = {};
    expect((await loadSeasonStats(600, 28203, NOW)).summary).toBeNull();
  });

  it('Sportmonks hatası fırlatır (hata ≠ veri yok)', async () => {
    h.fail = '/seasons/';
    await expect(loadSeasonStats(600, 28203, NOW)).rejects.toThrow('Sportmonks 500');
  });

  it('tarayıcı proxy\'si sezon istatistiğini AÇMAZ', () => {
    expect(checkProxyAllowlist('football/seasons/28203', { include: 'statistics.participant' }).allowed).toBe(false);
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

describe('GET /api/leagues/season-stats', () => {
  it('süren sezon 200 + 1 sa CDN; biten sezon 24 sa', async () => {
    const live = await get({ league: '600', season: '28203' });
    expect(live.statusCode).toBe(200);
    expect(live.headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=21600');
    const done = await get({ league: '600', season: '25749' });
    expect(done.headers['Cache-Control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');
  });

  it('geçersiz parametre / uyuşmayan sezon 400', async () => {
    for (const q of [{ league: 'x', season: '1' }, { league: '600' }, { league: '600', season: '-1' }]) {
      expect((await get(q as Record<string, string>)).statusCode).toBe(400);
    }
    expect(h.calls).toEqual([]);
    expect((await get({ league: '600', season: '28155' })).statusCode).toBe(400);
  });

  it('Sportmonks hatası 502 no-store', async () => {
    h.fail = '/seasons/';
    const res = await get({ league: '600', season: '28203' });
    expect(res.statusCode).toBe(502);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
