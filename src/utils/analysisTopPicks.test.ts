/** "En güçlü 3 tahmin": kart rozetleriyle aynı seçim + isabet (olay gerçekleşti mi). */
import { describe, expect, it } from 'vitest';
import { parseScore, pickTopPredictions, topPickHit } from './analysisTopPicks';

const analysis = {
  matchPrediction: { home: 45, draw: 27, away: 28 },
  goalExpectation: { over15: 86, over25: 66, over35: 43, btts: 62, htOver05: 72, htOver15: 35, homeToScore: 88, awayToScore: 68, bttsFirstHalf: 24 },
};

describe('pickTopPredictions', () => {
  it('en yüksek 3 olasılık, sıralı (Leverkusen–Freiburg kartı)', () => {
    expect(pickTopPredictions(analysis)).toEqual([
      { key: 'homeToScore', pct: 88 },
      { key: 'over15', pct: 86 },
      { key: 'htOver05', pct: 72 },
    ]);
  });
  it('geçersiz / eksik değerler atlanır', () => {
    expect(pickTopPredictions({ matchPrediction: { home: 'x', draw: 0, away: 101 }, goalExpectation: null })).toEqual([]);
  });
});

describe('topPickHit', () => {
  const s = parseScore('2-1');
  it('skordan çıkarılanlar: olay gerçekleşti mi', () => {
    expect(topPickHit({ key: 'homeToScore', pct: 88 }, s)).toBe(true);
    expect(topPickHit({ key: 'over15', pct: 86 }, s)).toBe(true);
    expect(topPickHit({ key: 'over35', pct: 60 }, s)).toBe(false);
    expect(topPickHit({ key: 'home', pct: 45 }, s)).toBe(true); // "%45 ev sahibi kazanır" rozeti → kazandı
    expect(topPickHit({ key: 'draw', pct: 30 }, s)).toBe(false);
    expect(topPickHit({ key: 'btts', pct: 62 }, parseScore('0-0'))).toBe(false);
  });
  it('ilk yarı maddeleri değerlendirme kaydından (yön isabeti → olay)', () => {
    expect(topPickHit({ key: 'htOver05', pct: 72 }, s, { htOver05Hit: true })).toBe(true);
    expect(topPickHit({ key: 'htOver05', pct: 72 }, s, { htOver05Hit: false })).toBe(false);
    expect(topPickHit({ key: 'htOver15', pct: 35 }, s, { htOver15Hit: true })).toBe(false); // "olmaz" doğru çıktı → olmadı
    expect(topPickHit({ key: 'htOver05', pct: 72 }, s, {})).toBeNull();
  });
  it('skor yoksa ve kayıt yoksa bilinmiyor', () => {
    expect(topPickHit({ key: 'over15', pct: 80 }, null)).toBeNull();
    expect(parseScore('—')).toBeNull();
  });
});
