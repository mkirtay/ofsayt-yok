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

  it('her kaydın mini testi var: 3 şık, geçerli doğru şık, EN aynı yapıda', () => {
    for (const f of all) {
      for (const quiz of [f.soru, f.en.soru]) {
        expect(quiz.soru.trim(), f.id).not.toBe('');
        expect(quiz.aciklama.trim(), f.id).not.toBe('');
        expect(quiz.secenekler, f.id).toHaveLength(3);
        for (const option of quiz.secenekler) expect(option.trim(), f.id).not.toBe('');
        expect(new Set(quiz.secenekler).size, f.id).toBe(3);
      }
      expect(Number.isInteger(f.soru.dogru) && f.soru.dogru >= 0 && f.soru.dogru < 3, f.id).toBe(true);
    }
    // Doğru şık hep aynı sırada olmasın (tahminle bulunmasın).
    expect(new Set(all.map((f) => f.soru.dogru)).size).toBeGreaterThan(1);
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
    const quizEn = localizeFact(kaleci, 'en').quiz;
    expect(quizEn.question).toBe(kaleci.en.soru.soru);
    expect(quizEn.correct).toBe(kaleci.soru.dogru);
    expect(localizeFact(kaleci, 'tr').quiz.options).toEqual(kaleci.soru.secenekler);
  });
});
