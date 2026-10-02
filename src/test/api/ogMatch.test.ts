import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest } from 'next/server';

/** /api/og/match/[id] ve eski serbest metinli /api/og/match — güvenlik (metin kabul etmez) ve önbellek kuralları. */
const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  rendered: [] as Array<{ id: number }>,
}));

vi.mock('@/lib/resolveLiveMatch', () => ({ resolveSportmonksMatch: h.lookup }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/server/og/matchOgImage', () => ({
  renderMatchOgImage: (match: { id: number }) => {
    h.rendered.push(match);
    return { arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
  },
}));

import handler from '@/pages/api/og/match/[id]';
import legacy from '@/pages/api/og/match/index';

type Res = { statusCode: number; headers: Record<string, string>; body?: Buffer };

async function get(query: Record<string, string>): Promise<Res> {
  const out: Res = { statusCode: 0, headers: {} };
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
    },
    status(c: number) {
      out.statusCode = c;
      return this;
    },
    send(b: Buffer) {
      out.body = b;
    },
    end() {},
  };
  await handler({ method: 'GET', query, headers: { host: 'example.test' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return out;
}

const finished = { id: 19745050, status: 'FINISHED', time: '', scores: { score: '2-1' }, home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } };

beforeEach(() => {
  h.lookup.mockReset();
  h.rendered.length = 0;
});

describe('GET /api/og/match/[id]', () => {
  it('güncel sürüm → çizer; bitmiş maç 1 yıl immutable', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: finished, events: [] });
    const r = await get({ id: '19745050', v: 'F_2-1' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.headers['cache-control']).toContain('immutable');
    expect(h.rendered).toHaveLength(1);
  });

  it('eski / rastgele sürüm → çizmeden güncel adrese yönlenir (önbellek kırma CPU harcatamaz)', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: finished, events: [] });
    for (const v of ['S', 'L67_1-0', 'random-123', '']) {
      const r = await get({ id: '19745050', ...(v ? { v } : {}) });
      expect(r.statusCode).toBe(307);
      expect(r.headers.location).toBe('/api/og/match/19745050?v=F_2-1');
    }
    expect(h.rendered).toHaveLength(0);
  });

  it('geçersiz kimlik, maç yok ya da hata → varsayılan görsel (kısa önbellek)', async () => {
    expect((await get({ id: '../etc', v: 'S' })).headers.location).toBe('/images/og-default-v2.png');
    expect(h.lookup).not.toHaveBeenCalled();

    h.lookup.mockResolvedValueOnce({ kind: 'missing' });
    const missing = await get({ id: '19999999', v: 'S' });
    expect([missing.statusCode, missing.headers.location]).toEqual([307, '/images/og-default-v2.png']);
    expect(missing.headers['cache-control']).toBe('public, max-age=300, s-maxage=300');

    h.lookup.mockRejectedValueOnce(new Error('upstream'));
    expect((await get({ id: '19745050', v: 'F_2-1' })).headers.location).toBe('/images/og-default-v2.png');
    expect(h.rendered).toHaveLength(0);
  });
});

describe('eski /api/og/match?home=…', () => {
  it('serbest metni kabul etmez: her durumda varsayılan görsele 308', async () => {
    const r = legacy(new NextRequest('https://www.ofsaytyok.app/api/og/match?home=Sahte&away=Takım&score=9-0'));
    expect(r.status).toBe(308);
    expect(r.headers.get('location')).toBe('https://www.ofsaytyok.app/images/og-default-v2.png');
  });
});
