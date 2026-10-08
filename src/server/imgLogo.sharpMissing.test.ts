import { describe, expect, it, vi } from 'vitest';
import { renderLogo } from './imgLogo';

// Canlıdaki 2026-10 hatası: fonksiyon paketinde libvips-cpp.so yoktu → `import('sharp')` ERR_DLOPEN_FAILED ile düşüyordu.
vi.mock('sharp', () => {
  throw new Error("Could not load the \"sharp\" module using the linux-x64 runtime. ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.7");
});

describe('renderLogo — sharp yüklenemiyor', () => {
  it('modül düşmez (500 yok); orijinal logoya kısa önbellekli 302', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png' } }),
    ) as unknown as typeof fetch;
    for (let i = 0; i < 2; i++) {
      const r = await renderLogo('soccer/teams/24/3224.png', 32, fetchImpl);
      expect(r).toMatchObject({ status: 302, location: 'https://cdn.sportmonks.com/images/soccer/teams/24/3224.png' });
      expect(r.headers['Cache-Control']).toBe('public, max-age=300, s-maxage=300');
    }
    expect(error).toHaveBeenCalledWith(expect.stringContaining('sharp yüklenemedi'), expect.anything());
    error.mockRestore();
  });
});
