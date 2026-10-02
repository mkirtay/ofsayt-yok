import { describe, expect, it } from 'vitest';
import { findGamblingTerms } from './gamblingTerms';
import trCommon from '../../public/locales/tr/common.json';
import enCommon from '../../public/locales/en/common.json';

describe('findGamblingTerms', () => {
  it('bahis dilini yakalar', () => {
    expect(findGamblingTerms('Bahis / İddia Pazarı Analizi')).toEqual(['bahis', 'iddia pazarı']);
    expect(findGamblingTerms('Value Bet, kupon, banko')).toEqual(expect.arrayContaining(['value', 'kupon', 'banko', 'bet (en)']));
    expect(findGamblingTerms('Ev sahibi yönünde para akışı (oran düşüyor)')).toEqual(expect.arrayContaining(['para akışı', 'oran (bahis)']));
    expect(findGamblingTerms('Maç sonucu oranları')).toEqual(['oran (bahis)']);
    expect(findGamblingTerms('Match result odds')).toEqual(['bet (en)']);
  });

  it('istatistik dilini yakalamaz ("galibiyet oranı", "iddia etmek")', () => {
    expect(findGamblingTerms('Temiz kale oranı %40, ev galibiyet oranı yüksek')).toEqual([]);
    expect(findGamblingTerms('Bunu iddia etmek zor; 2+ gol olasılığı %58')).toEqual([]);
    expect(findGamblingTerms('İki takım da gol atar · Doğru / Yanlış')).toEqual([]);
  });
});

describe('footer uyarısı', () => {
  it('istatistik dilinde, bahis terimi yok (TR/EN)', () => {
    expect(trCommon.footer.disclaimer).toBe('İstatistiksel tahminler bilgi amaçlıdır.');
    expect(enCommon.footer.disclaimer).toBe('Statistical predictions are for informational purposes only.');
    expect(findGamblingTerms(trCommon.footer.disclaimer)).toEqual([]);
    expect(findGamblingTerms(enCommon.footer.disclaimer)).toEqual([]);
  });
});
