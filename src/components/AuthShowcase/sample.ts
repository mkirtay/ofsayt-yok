/**
 * Giriş / kayıt panelindeki örnek AI analizi: /pricing'deki gerçek, bitmiş maç (`content/pricingSampleAnalysis.json`).
 * JSON'un tamamı (tam rapor dahil) auth paketine girmesin diye yalnız gereken alanlar burada; değerlerin JSON'la
 * aynı kaldığını AuthShowcase testi denetler.
 */
export const AUTH_SAMPLE = {
  competition: 'Bundesliga',
  kickoffDate: '2026-10-18',
  home: { name: 'Leverkusen', short: 'B04', color: '#e32221' },
  away: { name: 'Freiburg', short: 'SCF', color: '#1f1f1f' },
  score: { home: 2, away: 1 },
  /** AI ön analizi: ev / beraberlik / deplasman yüzdesi + en olası skor. */
  prediction: { home: 45, draw: 27, away: 28, mostLikely: '2-1' },
  /** Maç sonu değerlendirmesi (predictionRecord): sonuç ve tam skor tuttu. */
  resultHit: true,
  scoreHit: true,
} as const;
