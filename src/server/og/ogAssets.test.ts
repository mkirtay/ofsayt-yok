import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { fetchLogoDataUri, ogFonts, teamInitials, toSatoriImage } from './ogAssets';

const png = () => new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } });

describe('ogAssets', () => {
  it('gömülü Inter: 600 ve 800, geçerli TTF (sfnt 0x00010000)', () => {
    const fonts = ogFonts();
    expect(fonts.map((f) => [f.name, f.weight])).toEqual([
      ['Inter', 600],
      ['Inter', 800],
    ]);
    for (const f of fonts) {
      expect(new DataView(f.data).getUint32(0)).toBe(0x00010000);
      expect(f.data.byteLength).toBeLessThan(60_000);
    }
  });

  it('logo: Sportmonks CDN → data URI; başka host / http / bozuk adres → istek yok, null', async () => {
    const fetchImpl = vi.fn(async () => png()) as unknown as typeof fetch;
    expect(await fetchLogoDataUri('https://cdn.sportmonks.com/images/soccer/teams/2/34.png', { fetchImpl })).toMatch(
      /^data:image\/png;base64,/,
    );
    for (const bad of ['https://evil.example/x.png', 'http://cdn.sportmonks.com/x.png', 'not a url', '', null]) {
      expect(await fetchLogoDataUri(bad, { fetchImpl })).toBeNull();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('logo zaman aşımı (1,5 sn) / HTTP hatası / görsel olmayan yanıt → null (baş harfler çizilir)', async () => {
    vi.useFakeTimers();
    try {
      const hanging = vi.fn(
        (_u: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      ) as unknown as typeof fetch;
      const p = fetchLogoDataUri('https://cdn.sportmonks.com/a.png', { fetchImpl: hanging });
      await vi.advanceTimersByTimeAsync(1_499);
      let settled = false;
      void p.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    const notFound = vi.fn(async () => new Response('x', { status: 404, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
    expect(await fetchLogoDataUri('https://cdn.sportmonks.com/a.png', { fetchImpl: notFound })).toBeNull();
    const html = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect(await fetchLogoDataUri('https://cdn.sportmonks.com/a.png', { fetchImpl: html })).toBeNull();
  });

  it('baş harfler (Türkçe büyük harf)', () => {
    expect(teamInitials('Real Oviedo')).toBe('RO');
    expect(teamInitials('İstanbul Başakşehir')).toBe('İB');
    expect(teamInitials('istanbulspor')).toBe('İ');
    expect(teamInitials("Hapoel Be'er Sheva")).toBe('HB');
    expect(teamInitials('')).toBe('?');
  });

  it('içerikten tür: başlık image/png diyen WebP (Sportmonks GS logosu) → PNG\'ye çevrilir; PNG / SVG aynen', async () => {
    const webp = await sharp({ create: { width: 300, height: 300, channels: 4, background: '#c00' } }).webp().toBuffer();
    const fromWebp = await toSatoriImage(webp);
    expect(fromWebp).toMatch(/^data:image\/png;base64,/);
    const meta = await sharp(Buffer.from(fromWebp!.split(',')[1]!, 'base64')).metadata();
    expect([meta.format, meta.width]).toEqual(['png', 256]);

    const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#0c0' } }).png().toBuffer();
    expect(await toSatoriImage(png)).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(await toSatoriImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatch(/^data:image\/svg\+xml/);
    expect(await toSatoriImage(Buffer.from('not an image'))).toBeNull();
  });
});
