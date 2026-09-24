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

function run(query: Record<string, string>, method = 'GET') {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; return res; },
  } as unknown as NextApiResponse;
  return handler({ method, query, headers: {}, socket: {} } as unknown as NextApiRequest, res).then(() => out);
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
