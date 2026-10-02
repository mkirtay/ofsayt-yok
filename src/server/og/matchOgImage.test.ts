import { describe, expect, it, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { renderMatchOgImage } from './matchOgImage';

/** Gerçek çizim (next/og): ağ yok — logolar çekilemezse baş harflerle; çıktı 1200×630 PNG. */
afterEach(() => vi.restoreAllMocks());

describe('renderMatchOgImage', () => {
  it('logolar gelmezse (ağ hatası) yine 1200×630 PNG üretir', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const img = await renderMatchOgImage({
      id: 1,
      status: 'FINISHED',
      time: '',
      scores: { score: '2-1' },
      home: { id: 1, name: 'Galatasaray', logo: 'https://cdn.sportmonks.com/images/soccer/teams/2/34.png' },
      away: { id: 2, name: 'Fenerbahçe', logo: 'https://cdn.sportmonks.com/images/soccer/teams/24/88.png' },
      competition: { id: 600, name: 'Süper Lig' },
    });
    const buf = Buffer.from(await img.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
  });
});
