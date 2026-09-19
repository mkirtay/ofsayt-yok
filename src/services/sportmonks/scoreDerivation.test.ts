import { describe, it, expect } from 'vitest';
import { deriveMatchScore } from './scoreDerivation';
import scoresInplay from './__fixtures__/scoresInplay.json';
import superLigFixture from './__fixtures__/superLigFixture.json';
import type { SportmonksScoreRow } from './types';

describe('deriveMatchScore', () => {
  it('gerçek 1ST_HALF verisinden (fixture 19874789, Pass 1) ht_score üretir', () => {
    const result = deriveMatchScore(scoresInplay as SportmonksScoreRow[]);
    expect(result).not.toBeNull();
    expect(result?.ht_score).toBe('0-0');
    // Bu gerçek örnekte CURRENT satırı yok (rapor sadece 1ST_HALF'ı ham JSON
    // olarak basıyor) — score alanı bu yüzden ht_score'a fallback eder.
    expect(result?.score).toBe('0-0');
  });

  it('boş/null dizide null döner', () => {
    expect(deriveMatchScore([])).toBeNull();
    expect(deriveMatchScore(null)).toBeNull();
    expect(deriveMatchScore(undefined)).toBeNull();
  });

  /**
   * Faz 4 (docs/SPORTMONKS_MIGRATION_PLAN.md "Faz 4 — Doğrulama"): bu dal Pass
   * 1'de gerçek gol sayısı paylaşılmadığı için `it.todo` bırakılmıştı. Faz 2'de
   * eklenen `superLigFixture.json` (gerçek fixture 19746621, Fenerbahçe 1-2
   * Beşiktaş) tam CURRENT+2ND_HALF+1ST_HALF üçlüsünü içeriyor — artık gerçek
   * veriyle kapatılabiliyor.
   */
  it('gerçek CURRENT + 2ND_HALF verisinden (fixture 19746621, Süper Lig) score/ft_score üretir', () => {
    const result = deriveMatchScore(superLigFixture.scores as SportmonksScoreRow[]);
    expect(result).not.toBeNull();
    // 1ST_HALF: home(Fenerbahçe)=1, away(Beşiktaş)=1 → devre arası 1-1
    expect(result?.ht_score).toBe('1-1');
    // 2ND_HALF: home=1, away=2 — Sportmonks'ta bu description "sadece 2. devre
    // golleri" değil, 2. devre SONUNDAKİ kümülatif skor (CURRENT'la birebir
    // aynı değer, 1-2, doğruluyor) — scoreDerivation.ts'in "2ND_HALF'i doğrudan
    // ft_score'a yaz" varsayımı bu gerçek örnekle teyit edildi.
    expect(result?.ft_score).toBe('1-2');
    // CURRENT: home=1, away=2 → maçın son/güncel skoru
    expect(result?.score).toBe('1-2');
  });
});
