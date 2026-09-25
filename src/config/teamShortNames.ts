/**
 * Puan durumu kısaltması override'ı — Sportmonks `short_code` Türk taraftarına yabancı ("BES", "FEN", "IBA").
 * Anahtar: Sportmonks team id. `standingTeamShortCode` önce buraya bakar, yoksa `short_code`'a düşer.
 * Mobil bu dosyayı birebir kopyalar; düz id → metin tablosu olarak kalmalı.
 *
 * Kaynak: Süper Lig 2026/27 (season 28203) puan durumu; isim eşleşmesi `teamShortNames.test.ts`'te.
 */
export const TEAM_SHORT_NAMES: Readonly<Record<number, string>> = {
  34: 'GS', // Galatasaray
  88: 'FB', // Fenerbahçe
  554: 'BJK', // Beşiktaş
  688: 'TS', // Trabzonspor
  3570: 'AMD', // Amed SK
  13860: 'KOC', // Kocaelispor
  347: 'ALN', // Alanyaspor
  1071: 'KSP', // Kasımpaşa
  1041: 'ÇRS', // Rizespor
  4192: 'GFK', // Gaziantep F.K.
  13871: 'ÇRM', // Çorum FK
  3702: 'İBFK', // İstanbul Başakşehir
  286: 'GB', // Gençlerbirliği
  13818: 'ERZ', // Erzurumspor FK
  2632: 'KON', // Konyaspor
  2811: 'SAM', // Samsunspor
  3897: 'GÖZ', // Göztepe
  3224: 'EYP', // Eyüpspor
};
