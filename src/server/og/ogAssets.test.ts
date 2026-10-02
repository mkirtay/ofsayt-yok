import { describe, expect, it, vi } from 'vitest';
import { fetchLogoDataUri, ogFonts, teamInitials } from './ogAssets';

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
});
