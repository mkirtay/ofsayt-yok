import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** /api/og/* — kanonik olmayan adres çizmeden 308; çizim yolu IP + global bütçeyle sınırlı (aşılınca varsayılan görsele 307). */
const h = vi.hoisted(() => ({
  rendered: [] as string[],
  lookup: vi.fn(),
  load: vi.fn(),
  rl: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: h.rl, requestIp: () => '203.0.113.9' }));
vi.mock('@/lib/resolveLiveMatch', () => ({ resolveSportmonksMatch: h.lookup }));
vi.mock('@/server/og/teamOgData', () => ({ loadTeamOgData: h.load }));
const png = { arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
vi.mock('@/server/og/frikikOgImage', () => ({ renderFrikikOgImage: () => (h.rendered.push('frikik'), png) }));
vi.mock('@/server/og/matchOgImage', () => ({ renderMatchOgImage: async () => (h.rendered.push('match'), png) }));
vi.mock('@/server/og/teamOgImage', () => ({ renderTeamOgImage: async () => (h.rendered.push('team'), png) }));

import frikik from '@/pages/api/og/frikik';
import match from '@/pages/api/og/match/[id]';
import team from '@/pages/api/og/team/[id]';
import { teamOgVersion } from '@/utils/teamOgImage';
import { OG_RENDER_GLOBAL_LIMIT, OG_RENDER_IP_LIMIT } from '@/server/og/ogGuard';

type Res = { statusCode: number; headers: Record<string, string> };
type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

/** Next'in yaptığı gibi: `req.query` ayrıştırılmış, ham adres istek meta verisinde (`initURL`). */
async function get(handler: Handler, rawUrl: string, params: Record<string, string> = {}): Promise<Res> {
  const u = new URL(rawUrl, 'http://x.test');
  const query: Record<string, string | string[]> = { ...params };
  for (const [k, v] of u.searchParams) {
    const prev = query[k];
    query[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  Object.assign(query, params); // rota parametresi sorgudakini ezer (Next davranışı)
  const out: Res = { statusCode: 0, headers: {} };
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
    },
    status(c: number) {
      out.statusCode = c;
      return this;
    },
    send() {},
    end() {},
  };
  const req = { method: 'GET', url: u.pathname + u.search, query, headers: {}, [Symbol.for('NextInternalRequestMeta')]: { initURL: rawUrl } };
  await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return out;
}

const finished = { id: 19745050, status: 'FINISHED', time: '', scores: { score: '2-1' } };
const teamData = { team: { id: 34, name: 'Galatasaray' }, competition: null, standing: null, form: [] };

beforeEach(() => {
  h.rendered.length = 0;
  h.lookup.mockReset().mockResolvedValue({ kind: 'found', match: finished, events: [] });
  h.load.mockReset().mockResolvedValue(teamData);
  h.rl.mockReset().mockResolvedValue({ success: true, remaining: 1, resetAt: 0 });
});

describe('kanonik adres: çizmeden 308', () => {
  it.each([
    ['/api/og/frikik?r=1', '/api/og/frikik'],
    // Eski seri modu (`?s=` tek başına) kaldırıldı → skorsuz kanonik adres
    ['/api/og/frikik?s=850&r=1', '/api/og/frikik'],
    ['/api/og/frikik?s=0850', '/api/og/frikik'],
    ['/api/og/frikik?l=1&s=75&r=1', '/api/og/frikik?l=1&s=75'],
    ['/api/og/frikik?l=01&s=75', '/api/og/frikik?l=1&s=75'],
    ['/api/og/frikik?l=1&s=75&l=1', '/api/og/frikik?l=1&s=75'],
    ['/api/og/frikik?s=75&l=1', '/api/og/frikik?l=1&s=75'],
    ['/api/og/frikik?d=2026-10-08&l=1&s=75', '/api/og/frikik?l=1&s=75&d=2026-10-08'],
    ['/api/og/frikik?l=1&s=75&d=2026-13-01', '/api/og/frikik?l=1&s=75'],
    ['/api/og/frikik?S=850', '/api/og/frikik'],
    ['/api/og/frikik?s=851', '/api/og/frikik'],
  ])('frikik %s → %s', async (raw, location) => {
    const r = await get(frikik as Handler, raw);
    expect([r.statusCode, r.headers.location]).toEqual([308, location]);
    expect(r.headers['cache-control']).toBe('public, max-age=86400, s-maxage=86400');
    expect(h.rendered).toEqual([]);
    expect(h.rl).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/og/match/19745050?v=F_2-1&r=1', '19745050', '/api/og/match/19745050?v=F_2-1'],
    ['/api/og/match/019745050?v=F_2-1', '019745050', '/api/og/match/19745050?v=F_2-1'],
    ['/api/og/match/19745050?v=F_2%2D1', '19745050', '/api/og/match/19745050?v=F_2-1'],
    ['/api/og/match/19745050?v=F_2-1&id=7', '19745050', '/api/og/match/19745050?v=F_2-1'],
    ['/api/og/match/19745050?v=a&v=b', '19745050', '/api/og/match/19745050?v=a'],
  ])('maç %s → veri okunmadan %s', async (raw, id, location) => {
    const r = await get(match as Handler, raw, { id });
    expect([r.statusCode, r.headers.location]).toEqual([308, location]);
    expect(h.lookup).not.toHaveBeenCalled();
    expect(h.rendered).toEqual([]);
  });

  it('takım: fazla parametre / baştaki sıfır → veri okunmadan 308', async () => {
    const v = teamOgVersion();
    for (const [raw, id] of [
      [`/api/og/team/34?v=${v}&x=1`, '34'],
      [`/api/og/team/034?v=${v}`, '034'],
    ] as const) {
      const r = await get(team as Handler, raw, { id });
      expect([r.statusCode, r.headers.location]).toEqual([308, `/api/og/team/34?v=${v}`]);
    }
    expect(h.load).not.toHaveBeenCalled();
    expect(h.rendered).toEqual([]);
  });

  it('kanonik adres (Vercel nxtPid ekiyle de) çizilir', async () => {
    expect((await get(frikik as Handler, '/api/og/frikik?l=1&s=75')).statusCode).toBe(200);
    expect((await get(match as Handler, '/api/og/match/19745050?nxtPid=19745050&v=F_2-1', { id: '19745050' })).statusCode).toBe(200);
    expect((await get(team as Handler, `/api/og/team/34?v=${teamOgVersion()}`, { id: '34' })).statusCode).toBe(200);
    expect(h.rendered).toEqual(['frikik', 'match', 'team']);
  });
});

describe('çizim bütçesi', () => {
  it('IP sınırı aşılınca: veri okunmaz, çizilmez, varsayılan görsele 307 (CDN saklamaz)', async () => {
    h.rl.mockImplementation(async (key: string) => ({ success: !key.startsWith('og-render:ip:'), remaining: 0, resetAt: 0 }));
    for (const r of [
      await get(frikik as Handler, '/api/og/frikik?l=1&s=75'),
      await get(match as Handler, '/api/og/match/19745050?v=F_2-1', { id: '19745050' }),
      await get(team as Handler, `/api/og/team/34?v=${teamOgVersion()}`, { id: '34' }),
    ]) {
      expect([r.statusCode, r.headers.location]).toEqual([307, '/images/og-default-v2.png']);
      expect(r.headers['cache-control']).toBe('private, max-age=60');
    }
    expect(h.lookup).not.toHaveBeenCalled();
    expect(h.load).not.toHaveBeenCalled();
    expect(h.rendered).toEqual([]);
    expect(h.rl).toHaveBeenCalledWith('og-render:ip:203.0.113.9', OG_RENDER_IP_LIMIT, 60_000);
  });

  it('global bütçe aşılınca çizilmez; yalnız çizimden önce sayılır (sürüm yönlendirmesi saymaz)', async () => {
    h.rl.mockImplementation(async (key: string) => ({ success: key !== 'og-render:global', remaining: 0, resetAt: 0 }));
    const r = await get(match as Handler, '/api/og/match/19745050?v=F_2-1', { id: '19745050' });
    expect([r.statusCode, r.headers.location]).toEqual([307, '/images/og-default-v2.png']);
    expect(h.rendered).toEqual([]);
    expect(h.rl).toHaveBeenCalledWith('og-render:global', OG_RENDER_GLOBAL_LIMIT, 10 * 60_000);

    h.rl.mockClear();
    const stale = await get(match as Handler, '/api/og/match/19745050?v=S', { id: '19745050' });
    expect([stale.statusCode, stale.headers.location]).toEqual([307, '/api/og/match/19745050?v=F_2-1']);
    expect(h.rl.mock.calls.map((c) => c[0])).toEqual(['og-render:ip:203.0.113.9']);
  });
});
