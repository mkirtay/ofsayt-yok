import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LOGO_CACHE_OK, parseLogoQuery, renderLogo } from './imgLogo';

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
