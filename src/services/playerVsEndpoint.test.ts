import { describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import sample from './sportmonks/__fixtures__/playerLineupsSample.json';
import { mapPlayerLineups, type RawPlayerLineup } from './playerLineups';

const state = vi.hoisted(() => ({ rows: null as unknown, fail: false, limited: false }));
vi.mock('@/lib/rateLimit', () => ({
  requestIp: () => '1.2.3.4',
  hitFixedWindowRateLimit: async () => ({ success: !state.limited, resetAt: Date.now() + 1000 }),
}));
vi.mock('@/services/playerLineups', async (orig) => ({
  ...(await orig<typeof import('./playerLineups')>()),
  getPlayerLineupRows: async () => {
    if (state.fail) throw new Error('upstream');
    return state.rows;
  },
}));

import handler from '@/pages/api/players/[id]/vs';
import matchesHandler from '@/pages/api/players/[id]/matches';

function run(query: Record<string, string>, method = 'GET', h: typeof handler = handler) {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; return res; },
  } as unknown as NextApiResponse;
  return h({ method, query, headers: {}, socket: {} } as unknown as NextApiRequest, res).then(() => out);
}

const icardiRows = mapPlayerLineups((sample as unknown as { icardi: { lineups: RawPlayerLineup[] } }).icardi.lineups);

describe('GET /api/players/[id]/vs', () => {
  it('rakip listesi: sahaya çıkılan maç sayısıyla', async () => {
    state.rows = icardiRows;
    const r = await run({ id: '129095' });
    expect(r.status).toBe(200);
    const body = r.body as { opponents: Array<{ id: number; matches: number }> };
    expect(body.opponents.find((o) => o.id === 88)?.matches).toBe(2); // yedekte kalınan 2024 maçı sayılmaz
    expect(r.headers['Cache-Control']).toContain('s-maxage');
  });

  it('rakip seçili: maçlar + oynamadı sayısı + özet (8\' reyting ortalamaya girmez)', async () => {
    state.rows = icardiRows;
    const r = await run({ id: '129095', opponentId: '88' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      playerId: 129095,
      minMinutesForAverage: 15,
      opponent: { id: 88, name: 'Fenerbahçe' },
      notPlayed: 1,
      summary: { played: 2, won: 1, drawn: 1, lost: 0, averageRating: null, ratedMatches: 0, minutes: 9 },
    });
    expect((r.body as { matches: unknown[] }).matches).toHaveLength(2);
  });

  it('doğrulama / hata durumları', async () => {
    expect((await run({ id: 'abc' })).status).toBe(400);
    expect((await run({ id: '1', opponentId: 'x' })).status).toBe(400);
    expect((await run({ id: '1' }, 'POST')).status).toBe(405);
    state.rows = null;
    expect((await run({ id: '1' })).status).toBe(404);
    state.fail = true;
    expect((await run({ id: '1' })).status).toBe(502);
    state.fail = false;
    state.limited = true;
    expect((await run({ id: '1' })).status).toBe(429);
    state.limited = false;
  });
});

describe('GET /api/players/[id]/matches', () => {
  it('son maçlar: en yeni önce, oynamadığı maç satırı dahil, aynı cache', async () => {
    state.rows = icardiRows;
    const r = await run({ id: '129095' }, 'GET', matchesHandler as typeof handler);
    expect(r.status).toBe(200);
    const body = r.body as { minMinutesForAverage: number; rows: Array<{ date: string }> };
    expect(body.minMinutesForAverage).toBe(15);
    expect(body.rows.length).toBe(icardiRows.length); // örnek < 20 maç → hepsi
    expect(body.rows.map((x) => x.date)).toEqual([...body.rows.map((x) => x.date)].sort().reverse());
  });

  it('doğrulama / hata', async () => {
    const mh = matchesHandler as typeof handler;
    expect((await run({ id: 'x' }, 'GET', mh)).status).toBe(400);
    state.rows = null;
    expect((await run({ id: '1' }, 'GET', mh)).status).toBe(404);
    state.fail = true;
    expect((await run({ id: '1' }, 'GET', mh)).status).toBe(502);
    state.fail = false;
  });
});
