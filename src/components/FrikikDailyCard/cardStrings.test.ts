import { describe, expect, it } from 'vitest';
import tr from '../../../public/locales/tr/common.json';
import en from '../../../public/locales/en/common.json';

/**
 * Oynanmış kart mobilde tek satır sonuç + tek satır not bütçesiyle aynı yükseklikte kalıyor (146 px, kayma yok); CSS
 * taşanı keser. 320 px'te ölçülen sığma sınırı ≈ 40 karakter (not, 13 px) ve ≈ 36 karakter (sonuç + sıra, 15 px kalın;
 * "Bugün:" öneki mobilde gizli). Metin uzarsa kesilmesin diye karakter bütçesi vekil olarak sınanır.
 */
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

describe.each([
  ['tr', tr.frikikCard, '12.345'],
  ['en', en.frikikCard, '12,345'],
])('Günün Frikiği kartı metinleri (%s)', (_lang, c, score) => {
  it('oynanmış kart notları tek satıra sığar (≤ 40 karakter)', () => {
    for (const s of [c.tomorrow, c.notRecorded, c.signInToPost]) expect(s.length, s).toBeLessThanOrEqual(40);
  });

  it('sonuç + sıra en kötü durumda tek satıra sığar (≤ 36 karakter)', () => {
    const line = `${fill(c.yourResult, { level: '15', score })} · ${fill(c.yourRank, { rank: '123' })}`;
    expect(line.length, line).toBeLessThanOrEqual(36);
  });
});
