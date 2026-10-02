import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** /api/og/team/[id] — yalnız kimlik + gün; sürüm dışı istek çizilmez; önbellek 1 gün. */
const h = vi.hoisted(() => ({ load: vi.fn(), rendered: 0 }));
vi.mock('@/server/og/teamOgData', () => ({ loadTeamOgData: h.load }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/server/og/teamOgImage', () => ({
  renderTeamOgImage: async () => {
    h.rendered += 1;
    return { arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
  },
}));

import handler from '@/pages/api/og/team/[id]';
import { teamOgImagePath, teamOgVersion } from '@/utils/teamOgImage';

type Res = { statusCode: number; headers: Record<string, string> };
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
    send() {},
    end() {},
  };
  await handler({ method: 'GET', query, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return out;
}

const data = { team: { id: 34, name: 'Galatasaray' }, competition: null, standing: null, form: [] };

beforeEach(() => {
  h.load.mockReset();
  h.rendered = 0;
});

describe('GET /api/og/team/[id]', () => {
  it('bugünün sürümü → çizer, CDN 1 gün', async () => {
    h.load.mockResolvedValue(data);
    const r = await get({ id: '34', v: teamOgVersion() });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toContain('s-maxage=86400');
    expect(h.rendered).toBe(1);
  });

  it('eski / rastgele sürüm → veri okunmadan, çizilmeden güncel adrese 307', async () => {
    for (const v of ['20200101', 'abc']) {
      const r = await get({ id: '34', v });
      expect([r.statusCode, r.headers.location]).toEqual([307, `/api/og/team/34?v=${teamOgVersion()}`]);
    }
    expect(h.load).not.toHaveBeenCalled();
    expect(h.rendered).toBe(0);
  });

  it('7 günlük kabuktaki eski v (sayfa 7 gün önce üretildi) → güncel adrese 307; dünkü v doğrudan çizilir', async () => {
    h.load.mockResolvedValue(data);
    const DAY = 86_400_000;
    for (const age of [2, 7, 8]) {
      const oldPath = teamOgImagePath(34, Date.now() - age * DAY); // kabuğun HTML'e yazdığı adres
      const r = await get({ id: '34', v: oldPath.split('v=')[1]! });
      expect([r.statusCode, r.headers.location]).toEqual([307, `/api/og/team/34?v=${teamOgVersion()}`]);
    }
    expect(h.rendered).toBe(0);
    const yesterday = await get({ id: '34', v: teamOgImagePath(34, Date.now() - DAY).split('v=')[1]! });
    expect(yesterday.statusCode).toBe(200);
  });

  it('geçersiz kimlik, takım yok, hata → varsayılan görsel (kısa önbellek)', async () => {
    expect((await get({ id: '34abc', v: teamOgVersion() })).headers.location).toBe('/images/og-default-v2.png');
    h.load.mockResolvedValueOnce(null);
    const missing = await get({ id: '999', v: teamOgVersion() });
    expect([missing.statusCode, missing.headers.location, missing.headers['cache-control']]).toEqual([
      307,
      '/images/og-default-v2.png',
      'public, max-age=300, s-maxage=300',
    ]);
    h.load.mockRejectedValueOnce(new Error('upstream'));
    expect((await get({ id: '34', v: teamOgVersion() })).headers.location).toBe('/images/og-default-v2.png');
    expect(h.rendered).toBe(0);
  });
});
