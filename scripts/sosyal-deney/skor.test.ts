import { describe, expect, it } from 'vitest';
import { karar, skorla, type Deney, type Varyant } from './skor';

const yayin = '2026-11-24T16:00:00.000Z';
const t = (saat: number) =>
  new Date(Date.parse(yayin) + saat * 3_600_000).toISOString();

function v(kod: string, o: Partial<NonNullable<Varyant['olcum']>>, saat = 28): Varyant {
  return {
    kod,
    hook: `hook ${kod}`,
    platform: 'instagram',
    videoSn: 20,
    yayinZamani: yayin,
    olcum: {
      zaman: t(saat),
      izlenme: 1000,
      ortSureSn: 8,
      paylasim: 10,
      kaydet: 10,
      begeni: 50,
      yorum: 2,
      takip: 3,
      ...o,
    },
  };
}
const dn = (varyantlar: Varyant[]): Deney => ({
  id: 'x',
  konu: 'k',
  olusturma: yayin,
  varyantlar,
});

describe('skorla', () => {
  it('daha iyi izlenme süresi ve paylaşımı olan öne geçer', () => {
    const s = skorla([v('A', {}), v('B', { ortSureSn: 14, paylasim: 30 })]);
    expect(s[0].kod).toBe('B');
    expect(s[0].skor).toBeGreaterThan(s[1].skor);
  });

  it('ölçüm süresi yoksa tamamlanma ağırlıktan düşer, NaN üretmez', () => {
    const s = skorla([v('A', { ortSureSn: undefined }), v('B', { ortSureSn: undefined, paylasim: 40 })]);
    expect(s.every((x) => Number.isFinite(x.skor))).toBe(true);
    expect(s[0].kod).toBe('B');
  });
});

describe('karar', () => {
  it('net farkta kazananı verir', () => {
    const k = karar(dn([v('A', {}), v('B', { ortSureSn: 15, paylasim: 40, takip: 12 })]));
    expect(k).toMatchObject({ tip: 'kazanan', kod: 'B' });
  });

  it('küçük farkta belirsiz der', () => {
    const k = karar(dn([v('A', {}), v('B', { paylasim: 11 })]));
    expect(k.tip).toBe('belirsiz');
  });

  it('az izlenmeli varyantları karara almaz', () => {
    const k = karar(dn([v('A', {}), v('B', { izlenme: 120, paylasim: 30 })]));
    expect(k.tip).toBe('belirsiz');
  });

  it('tek ölçümle veri-yok döner', () => {
    const k = karar(dn([v('A', {}), { ...v('B', {}), olcum: undefined }]));
    expect(k.tip).toBe('veri-yok');
  });

  it('24–32 saat penceresi dışında uyarır', () => {
    const k = karar(dn([v('A', {}, 10), v('B', { ortSureSn: 15, paylasim: 40, takip: 12 }, 28)]));
    expect(k.uyarilar.length).toBe(1);
  });
});
