/**
 * Takım ad sözlüğü — Sportmonks takım id'sine göre (id'ler ve tam adlar 2026-10-02'de Sportmonks'tan doğrulandı:
 * Süper Lig 2026/27, Şampiyonlar Ligi ve Avrupa Ligi 2026/27 sezon takımları + bugünkü listede kesilen ad).
 *
 * - `name`: Sportmonks'taki tam ad (doğrulama ve test için; ekranda Sportmonks'tan gelen ad kullanılır).
 * - `shortName`: dar ekranda (maç satırı, < 640 px) tam ad sığmadığında gösterilecek okunabilir kısa ad.
 * - `aliases`: takma adlar / yaygın yazımlar — AI asistanın takım çözümlemesi okur
 *   (server/assistant/matchAnalysisRequest.ts; başka yerde okunmaz).
 *
 * `config/teamShortNames.ts` (Süper Lig puan durumu kısaltmaları) ayrı amaçlıdır; bu dosyayla ilişkisi yok.
 */
export type TeamNameEntry = {
  name: string;
  shortName: string;
  aliases: string[];
};

export const TEAM_NAMES: Readonly<Record<number, TeamNameEntry>> = {
  // ── Süper Lig 2026/27 ──────────────────────────────────────────────────────────────────
  347: { name: 'Alanyaspor', shortName: 'Alanya', aliases: ['Alanya', 'ALN'] },
  3570: { name: 'Amed SK', shortName: 'Amed', aliases: ['Amedspor', 'Amed'] },
  554: { name: 'Beşiktaş', shortName: 'BJK', aliases: ['BJK', 'Kara Kartal', 'Kartal'] },
  13818: { name: 'Erzurumspor FK', shortName: 'Erzurumspor', aliases: ['Erzurumspor', 'Erzurum', 'Dadaşlar', 'ERZ'] },
  3224: { name: 'Eyüpspor', shortName: 'Eyüp', aliases: ['Eyüp', 'EYP'] },
  88: { name: 'Fenerbahçe', shortName: 'FB', aliases: ['FB', 'Fener', 'Sarı Kanarya', 'Kanarya'] },
  34: { name: 'Galatasaray', shortName: 'GS', aliases: ['Cimbom', 'Aslan', 'GS', 'Cim Bom'] },
  4192: { name: 'Gaziantep F.K.', shortName: 'Gaziantep', aliases: ['Gaziantep FK', 'Gaziantep', 'GFK'] },
  286: { name: 'Gençlerbirliği', shortName: 'G.Birliği', aliases: ['Gençler', 'G.Birliği', 'GB'] },
  3897: { name: 'Göztepe', shortName: 'GÖZ', aliases: ['Göz-Göz', 'GÖZ'] },
  1071: { name: 'Kasımpaşa', shortName: 'KSP', aliases: ['KSP', 'Paşa'] },
  13860: { name: 'Kocaelispor', shortName: 'Kocaeli', aliases: ['Kocaeli', 'KOC'] },
  2632: { name: 'Konyaspor', shortName: 'Konya', aliases: ['Konya', 'Anadolu Kartalı', 'KON'] },
  1041: { name: 'Rizespor', shortName: 'Rize', aliases: ['Çaykur Rizespor', 'Rize', 'ÇRS'] },
  2811: { name: 'Samsunspor', shortName: 'Samsun', aliases: ['Samsun', 'SAM'] },
  688: { name: 'Trabzonspor', shortName: 'Trabzon', aliases: ['Trabzon', 'Fırtına', 'TS'] },
  13871: { name: 'Çorum FK', shortName: 'Çorum', aliases: ['Çorum', 'ÇRM'] },
  3702: { name: 'İstanbul Başakşehir', shortName: 'Başakşehir', aliases: ['Başakşehir', 'Başak', 'İBFK'] },

  // ── Şampiyonlar Ligi / Avrupa Ligi 2026/27 — adı uzun takımlar ─────────────────────────────
  52: { name: 'AFC Bournemouth', shortName: 'Bournemouth', aliases: ['Bournemouth', 'Cherries'] },
  132649: { name: 'Ararat-Armenia', shortName: 'Ararat', aliases: ['Ararat Armenia', 'Ararat'] },
  7980: { name: 'Atlético de Madrid', shortName: 'Atlético', aliases: ['Atletico Madrid', 'Atlético Madrid', 'Atleti'] },
  3321: { name: 'Bayer 04 Leverkusen', shortName: 'Leverkusen', aliases: ['Bayer Leverkusen', 'Leverkusen'] },
  3877: { name: 'Borac Banja Luka', shortName: 'Borac', aliases: ['Borac'] },
  68: { name: 'Borussia Dortmund', shortName: 'Dortmund', aliases: ['BVB', 'Dortmund'] },
  36: { name: 'Celta de Vigo', shortName: 'Celta', aliases: ['Celta Vigo', 'Celta'] },
  2673: { name: 'Crvena Zvezda', shortName: 'C. Zvezda', aliases: ['Kızılyıldız', 'Red Star Belgrade', 'Red Star'] },
  51: { name: 'Crystal Palace', shortName: 'Palace', aliases: ['Palace'] },
  674: { name: 'Dinamo Zagreb', shortName: 'D. Zagreb', aliases: ['Dinamo'] },
  63383: { name: 'Egnatia Rrogozhinë', shortName: 'Egnatia', aliases: ['Egnatia'] },
  503: { name: 'FC Bayern München', shortName: 'Bayern', aliases: ['Bayern Münih', 'Bayern Munich', 'Bayern'] },
  6392: { name: 'FC Iberia 1999', shortName: 'Iberia 1999', aliases: ['Iberia'] },
  939: { name: 'FC Midtjylland', shortName: 'Midtjylland', aliases: ['Midtjylland'] },
  3781: { name: 'Górnik Zabrze', shortName: 'Górnik', aliases: ['Gornik Zabrze', 'Górnik'] },
  516: { name: "Hapoel Be'er Sheva", shortName: "Be'er Sheva", aliases: ['Hapoel Beer Sheva', "Be'er Sheva"] },
  3552: { name: 'Hradec Králové', shortName: 'Hradec', aliases: ['Hradec Kralove', 'Hradec'] },
  17303: { name: "Inter Club d'Escaldes", shortName: 'Escaldes', aliases: ["Inter d'Escaldes", 'Escaldes'] },
  890: { name: 'Jagiellonia Białystok', shortName: 'Jagiellonia', aliases: ['Jagiellonia Bialystok', 'Jagiellonia'] },
  928: { name: 'Kauno Žalgiris', shortName: 'Žalgiris', aliases: ['Zalgiris Kaunas', 'Žalgiris'] },
  10068: { name: 'Lincoln Red Imps', shortName: 'Lincoln', aliases: ['Lincoln'] },
  2997: { name: 'Maccabi Tel Aviv', shortName: 'M. Tel Aviv', aliases: ['Maccabi'] },
  9: { name: 'Manchester City', shortName: 'Man City', aliases: ['Man City', 'City'] },
  14: { name: 'Manchester United', shortName: 'Man Utd', aliases: ['Man Utd', 'Man United', 'United'] },
  602: { name: 'Olympiacos F.C.', shortName: 'Olympiacos', aliases: ['Olympiakos', 'Olimpiakos'] },
  79: { name: 'Olympique Lyonnais', shortName: 'Lyon', aliases: ['Lyon', 'OL'] },
  44: { name: 'Olympique Marseille', shortName: 'Marseille', aliases: ['Marsilya', 'OM'] },
  368: { name: 'Omonia Nicosia', shortName: 'Omonia', aliases: ['Omonia Lefkoşa', 'Omonia'] },
  591: { name: 'Paris Saint Germain', shortName: 'PSG', aliases: ['PSG', 'Paris SG', 'Paris Saint-Germain'] },
  594: { name: 'Real Sociedad', shortName: 'R. Sociedad', aliases: ['Sociedad', 'La Real'] },
  621: { name: 'Shakhtar Donetsk', shortName: 'Shakhtar', aliases: ['Şahtar Donetsk', 'Shakhtar'] },
  207: { name: 'Shamrock Rovers', shortName: 'Shamrock', aliases: ['Shamrock'] },
  2417: { name: 'Slovan Bratislava', shortName: 'Slovan', aliases: ['Slovan'] },
  2726: { name: 'TSG Hoffenheim', shortName: 'Hoffenheim', aliases: ['Hoffenheim'] },
  579: { name: 'The New Saints', shortName: 'TNS', aliases: ['TNS'] },
  3958: { name: 'Union Saint-Gilloise', shortName: 'Union SG', aliases: ['Union SG', 'USG'] },
  9426: { name: 'Universitatea Cluj', shortName: 'U Cluj', aliases: ['U Cluj'] },
  11676: { name: 'Universitatea Craiova', shortName: 'U Craiova', aliases: ['Craiova', 'U Craiova'] },
  3319: { name: 'VfB Stuttgart', shortName: 'Stuttgart', aliases: ['Stuttgart'] },
  3545: { name: 'Viktoria Plzeň', shortName: 'Plzeň', aliases: ['Viktoria Plzen', 'Plzen'] },
  2688: { name: 'Víkingur Reykjavík', shortName: 'Víkingur', aliases: ['Vikingur Reykjavik', 'Víkingur'] },

  // ── Bugünkü listede (2026-10-02, 375 px) kesilen ad ───────────────────────────────────────
  2649: { name: 'Seattle Sounders', shortName: 'Seattle', aliases: ['Seattle Sounders FC', 'Sounders'] },
};
