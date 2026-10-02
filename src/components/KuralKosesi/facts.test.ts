import { describe, expect, it } from 'vitest';
import facts from '@/content/kural-kosesi.json';
import source from '../../../docs/animasyon-referans/kural-kosesi.json';
import { FACT_ANIMATIONS, localizeFact, type KuralFact } from './facts';

const all = facts as unknown as KuralFact[];

describe('kural-kosesi.json', () => {
  it('id\'ler benzersiz', () => {
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  });

  it('her kaydın animasyonu tanımlı ve TR/EN metni dolu', () => {
    for (const f of all) {
      expect(FACT_ANIMATIONS, f.id).toContain(f.animasyon);
      for (const text of [f, f.en]) {
        expect(text.baslik.trim(), f.id).not.toBe('');
        expect(text.metin.trim(), f.id).not.toBe('');
      }
      // Not iki dilde birlikte var ya da birlikte yok.
      expect(Boolean(f.en.biliyorMuydun), f.id).toBe(Boolean(f.biliyorMuydun));
    }
  });

  it('ilk içeriğin TR metinleri kaynakla birebir aynı', () => {
    for (const s of source) {
      const f = all.find((x) => x.id === s.id);
      expect(f, s.id).toBeDefined();
      expect({ id: f!.id, baslik: f!.baslik, metin: f!.metin, biliyorMuydun: f!.biliyorMuydun, animasyon: f!.animasyon }).toEqual(s);
    }
  });

  it('localizeFact dile göre seçer', () => {
    const kaleci = all.find((f) => f.id === 'kaleci-8-saniye')!;
    expect(localizeFact(kaleci, 'tr').animation).toBe('13-kaleci-8-saniye');
    expect(localizeFact(kaleci, 'en').title).toBe(kaleci.en.baslik);
    const yedi = all.find((f) => f.id === 'yedi-oyuncu')!;
    expect(localizeFact(yedi, 'tr').note).toBeNull();
  });
});
