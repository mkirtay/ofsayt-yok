import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { ALLOWED_SHARP_LOADERS, LOGO_CACHE_OK, parseLogoQuery, renderLogo } from './imgLogo';
import { toSatoriImage } from './og/ogAssets';

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
}

function upstream(body: Buffer | null, init: { status?: number; type?: string } = {}) {
  return vi.fn(async () =>
    new Response(body ? new Uint8Array(body) : null, {
      status: init.status ?? 200,
      headers: { 'content-type': init.type ?? 'image/png', ...(body ? { 'content-length': String(body.byteLength) } : {}) },
    }),
  ) as unknown as typeof fetch;
}

describe('parseLogoQuery', () => {
  it('beyaz listedeki genişlik + güvenli Sportmonks yolu', () => {
    expect(parseLogoQuery('soccer/teams/0/4192.png', '48')).toEqual({ path: 'soccer/teams/0/4192.png', width: 48 });
    expect(parseLogoQuery('soccer/teams/0/4192.png', '50')).toBeNull();
    expect(parseLogoQuery('soccer/teams/0/4192.png', undefined)).toBeNull();
    expect(parseLogoQuery('https://evil.com/a.png', '48')).toBeNull();
    expect(parseLogoQuery('../secret.png', '48')).toBeNull();
    expect(parseLogoQuery(['a.png', 'b.png'], '48')).toBeNull();
  });
});

describe('renderLogo', () => {
  it('büyük PNG → istenen genişlikte webp, 1 yıl immutable; yalnız cdn.sportmonks.com istenir', async () => {
    const fetchImpl = upstream(await png(1200, 1413));
    const r = await renderLogo('soccer/teams/0/4192.png', 48, fetchImpl);
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.headers['Content-Type']).toBe('image/webp');
    expect(r.headers['Cache-Control']).toBe(LOGO_CACHE_OK);
    const meta = await sharp(r.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.height).toBe(48);
    expect(meta.width).toBeLessThanOrEqual(48);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('https://cdn.sportmonks.com/images/soccer/teams/0/4192.png');
  });

  it('küçük görsel büyütülmez', async () => {
    const r = await renderLogo('soccer/teams/1/1.png', 128, upstream(await png(40, 40)));
    expect(r.status).toBe(200);
    if (r.status === 200) expect((await sharp(r.body).metadata()).width).toBe(40);
  });

  it('upstream 404 → 404 (1 gün); diğer hata / görsel olmayan → orijinale 302', async () => {
    expect((await renderLogo('soccer/teams/1/1.png', 48, upstream(null, { status: 404 }))).status).toBe(404);
    const r500 = await renderLogo('soccer/teams/1/1.png', 48, upstream(null, { status: 500 }));
    expect(r500).toMatchObject({ status: 302, location: 'https://cdn.sportmonks.com/images/soccer/teams/1/1.png' });
    const html = await renderLogo('soccer/teams/1/1.png', 48, upstream(Buffer.from('<html>'), { type: 'text/html' }));
    expect(html.status).toBe(302);
    const broken = await renderLogo('soccer/teams/1/1.png', 48, upstream(Buffer.from('not an image')));
    expect(broken.status).toBe(302);
    const throwing = vi.fn(async () => { throw new Error('ağ'); }) as unknown as typeof fetch;
    expect((await renderLogo('soccer/teams/1/1.png', 48, throwing)).status).toBe(302);
  });
});

describe('renderLogo — savunma derinliği (O10/D33)', () => {
  const solid = () => sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 90, b: 200, alpha: 1 } } });

  it("upstream fetch yönlendirme takip etmez (redirect: 'error'); yönlendirme hatası → 302 yedeği", async () => {
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.redirect === 'error') throw new TypeError('fetch failed: redirect mode is set to error');
      return new Response(new Uint8Array(await png(8, 8)), { status: 200, headers: { 'content-type': 'image/png' } });
    }) as unknown as typeof fetch;
    const r = await renderLogo('soccer/teams/1/1.png', 48, fetchImpl);
    expect(r.status).toBe(302);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
  });

  it('izinli yükleyiciler: PNG / JPEG / WebP / GIF → webp', async () => {
    expect(ALLOWED_SHARP_LOADERS).toEqual([
      'VipsForeignLoadPngBuffer', 'VipsForeignLoadJpegBuffer', 'VipsForeignLoadWebpBuffer', 'VipsForeignLoadNsgifBuffer',
    ]);
    for (const [fmt, buf] of [
      ['png', await solid().png().toBuffer()],
      ['jpeg', await solid().jpeg().toBuffer()],
      ['webp', await solid().webp().toBuffer()],
      ['gif', await solid().gif().toBuffer()],
    ] as const) {
      const r = await renderLogo(`soccer/teams/1/1.${fmt === 'jpeg' ? 'jpg' : fmt}`, 48, upstream(buf, { type: `image/${fmt}` }));
      expect([fmt, r.status]).toEqual([fmt, 200]);
    }
  });

  it('SVG, AVIF/HEIF, TIFF yükleyicileri kapalı → sunucuda çözülmez, orijinale 302', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
    const cases: [string, Buffer][] = [
      ['image/svg+xml', svg],
      ['image/avif', await solid().avif().toBuffer()],
      ['image/heif', await solid().heif({ compression: 'av1' }).toBuffer()],
      ['image/tiff', await solid().tiff().toBuffer()],
    ];
    for (const [type, buf] of cases) {
      expect([type, (await renderLogo('soccer/teams/1/1.png', 48, upstream(buf, { type }))).status]).toEqual([type, 302]);
      await expect(sharp(buf).metadata()).rejects.toThrow(); // süreç genelinde kapalı
    }
  });

  it('OG logo dönüşümü kilit altında da çalışır: WebP/GIF → PNG, PNG/JPEG/SVG sharp\'a girmeden', async () => {
    const webp = await toSatoriImage(await solid().webp().toBuffer());
    expect(webp).toMatch(/^data:image\/png;base64,/);
    const gif = await toSatoriImage(await solid().gif().toBuffer());
    expect(gif).toMatch(/^data:image\/png;base64,/);
    expect(await toSatoriImage(await solid().png().toBuffer())).toMatch(/^data:image\/png;base64,/);
    expect(await toSatoriImage(await solid().jpeg().toBuffer())).toMatch(/^data:image\/jpeg;base64,/);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>');
    expect(await toSatoriImage(svg)).toMatch(/^data:image\/svg\+xml;base64,/);
    // AVIF artık null (baş harfler çizilir) — Sportmonks logoları PNG/WebP
    expect(await toSatoriImage(await solid().avif().toBuffer())).toBeNull();
  });
});
