/**
 * Dünya Kupası takım künyeleri — küratörlü statik veri.
 *
 * Bu veri, video-pipeline'ın ürettiği briefing içeriğinin web uygulamasındaki karşılığıdır.
 * Pipeline'a (scripts/) doğrudan bağımlılık yaratmamak için uygulama içinde kendi kendine
 * yeten bir kaynak olarak tutulur. Eşleştirme, LiveScore takım adından bağımsız olsun diye
 * normalize edilmiş ad + takma adlar (TR/EN) üzerinden yapılır.
 *
 * Kaynaklar: Transfermarkt (kadro değeri/yıldız oyuncu), FIFA Dünya Kupası tarihçesi
 * (katılım/şampiyonluk/en iyi derece). Değerler yaklaşıktır ve dönemsel güncellenmelidir.
 */

export interface WorldCupStarPlayer {
  name: string;
  club: string;
  value: string;
}

export interface WorldCupTeamProfile {
  /** Künye başlığında gösterilecek görünen ad (TR) */
  displayName: string;
  squadValue: string;
  avgAge: number;
  starPlayer: WorldCupStarPlayer;
  titles: number;
  bestFinish: string;
  totalAppearances: number;
  /** Kısa, doğrulanmış ilginç gerçekler */
  funFacts: string[];
}

/** Normalize: küçük harf + Türkçe/aksanlı karakterleri sadeleştir + boşlukları kırp */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const PROFILES: WorldCupTeamProfile[] = [
  {
    displayName: 'Türkiye',
    squadValue: '~€750M',
    avgAge: 26.3,
    starPlayer: { name: 'Arda Güler', club: 'Real Madrid', value: '~€60M' },
    titles: 0,
    bestFinish: 'Üçüncü (2002)',
    totalAppearances: 2,
    funFacts: [
      '2002 Dünya Kupası’nda üçüncü olarak en iyi derecesine ulaştı.',
      'Sadece 1954 ve 2002’de Dünya Kupası’nda yer aldı.',
    ],
  },
  {
    displayName: 'Brezilya',
    squadValue: '~€900M',
    avgAge: 26.0,
    starPlayer: { name: 'Vinicius Jr.', club: 'Real Madrid', value: '~€200M' },
    titles: 5,
    bestFinish: 'Şampiyon',
    totalAppearances: 22,
    funFacts: [
      '5 şampiyonlukla en çok Dünya Kupası kazanan ülke.',
      'Tüm Dünya Kupalarına katılan tek ülke.',
    ],
  },
  {
    displayName: 'Almanya',
    squadValue: '~€850M',
    avgAge: 25.5,
    starPlayer: { name: 'Florian Wirtz', club: 'Bayer Leverkusen', value: '~€150M' },
    titles: 4,
    bestFinish: 'Şampiyon',
    totalAppearances: 20,
    funFacts: [
      '4 kez Dünya Kupası şampiyonu oldu (1954, 1974, 1990, 2014).',
      'Son iki Dünya Kupası’nda (2018, 2022) grup aşamasında elendi.',
    ],
  },
  {
    displayName: 'Fransa',
    squadValue: '~€1.1B',
    avgAge: 26.8,
    starPlayer: { name: 'Kylian Mbappé', club: 'Real Madrid', value: '~€180M' },
    titles: 2,
    bestFinish: 'Şampiyon',
    totalAppearances: 16,
    funFacts: [
      '1998 ve 2018’de şampiyon oldu, 2022’de finalde kaybetti.',
      'Kadro değeri olarak turnuvanın en pahalı takımlarından.',
    ],
  },
  {
    displayName: 'Arjantin',
    squadValue: '~€780M',
    avgAge: 27.2,
    starPlayer: { name: 'Lionel Messi', club: 'Inter Miami', value: '~€20M' },
    titles: 3,
    bestFinish: 'Şampiyon',
    totalAppearances: 18,
    funFacts: [
      '2022 Dünya Kupası’nın son şampiyonu.',
      '1978, 1986 ve 2022’de kupayı kazandı.',
    ],
  },
  {
    displayName: 'İspanya',
    squadValue: '~€950M',
    avgAge: 25.0,
    starPlayer: { name: 'Lamine Yamal', club: 'Barcelona', value: '~€200M' },
    titles: 1,
    bestFinish: 'Şampiyon',
    totalAppearances: 16,
    funFacts: [
      'Tek Dünya Kupası şampiyonluğunu 2010’da kazandı.',
      'Genç ve yüksek değerli bir kadroya sahip.',
    ],
  },
  {
    displayName: 'İngiltere',
    squadValue: '~€1.0B',
    avgAge: 26.5,
    starPlayer: { name: 'Jude Bellingham', club: 'Real Madrid', value: '~€180M' },
    titles: 1,
    bestFinish: 'Şampiyon',
    totalAppearances: 16,
    funFacts: [
      'Tek şampiyonluğu 1966’da, kendi evinde geldi.',
      '2018’de yarı finale yükseldi.',
    ],
  },
  {
    displayName: 'Portekiz',
    squadValue: '~€750M',
    avgAge: 27.0,
    starPlayer: { name: 'Cristiano Ronaldo', club: 'Al Nassr', value: '~€15M' },
    titles: 0,
    bestFinish: 'Üçüncü (1966)',
    totalAppearances: 8,
    funFacts: [
      'En iyi derecesi 1966’daki üçüncülük.',
      'Henüz Dünya Kupası kazanamadı.',
    ],
  },
  {
    displayName: 'Hollanda',
    squadValue: '~€650M',
    avgAge: 26.2,
    starPlayer: { name: 'Cody Gakpo', club: 'Liverpool', value: '~€70M' },
    titles: 0,
    bestFinish: 'İkinci (1974, 1978, 2010)',
    totalAppearances: 11,
    funFacts: [
      'Üç kez finale çıktı ama hiç şampiyon olamadı.',
      '“Toplam Futbol” akımının öncüsü olarak tarihe geçti.',
    ],
  },
  {
    displayName: 'Belçika',
    squadValue: '~€600M',
    avgAge: 27.0,
    starPlayer: { name: 'Kevin De Bruyne', club: 'Napoli', value: '~€30M' },
    titles: 0,
    bestFinish: 'Üçüncü (2018)',
    totalAppearances: 14,
    funFacts: [
      'En iyi derecesi 2018’deki üçüncülük.',
      '2022’de grup aşamasında elendi.',
    ],
  },
  {
    displayName: 'İtalya',
    squadValue: '~€700M',
    avgAge: 26.0,
    starPlayer: { name: 'Gianluigi Donnarumma', club: 'Manchester City', value: '~€35M' },
    titles: 4,
    bestFinish: 'Şampiyon',
    totalAppearances: 18,
    funFacts: [
      '4 kez Dünya Kupası şampiyonu oldu (1934, 1938, 1982, 2006).',
      'Son iki turnuvaya (2018, 2022) elemelerden katılamadı.',
    ],
  },
  {
    displayName: 'Japonya',
    squadValue: '~€350M',
    avgAge: 26.5,
    starPlayer: { name: 'Takefusa Kubo', club: 'Real Sociedad', value: '~€50M' },
    titles: 0,
    bestFinish: 'Son 16',
    totalAppearances: 7,
    funFacts: [
      '2022’de Almanya ve İspanya’yı yenerek grubunu lider bitirdi.',
      'En iyi derecesi son 16 turu.',
    ],
  },
  {
    displayName: 'Fas',
    squadValue: '~€350M',
    avgAge: 26.8,
    starPlayer: { name: 'Achraf Hakimi', club: 'Paris Saint-Germain', value: '~€70M' },
    titles: 0,
    bestFinish: 'Dördüncü (2022)',
    totalAppearances: 6,
    funFacts: [
      '2022’de yarı finale çıkan ilk Afrika takımı oldu.',
      'Dördüncülük, bir Afrika ülkesinin en iyi WC derecesi.',
    ],
  },
  {
    displayName: 'Meksika',
    squadValue: '~€280M',
    avgAge: 27.0,
    starPlayer: { name: 'Santiago Giménez', club: 'Milan', value: '~€40M' },
    titles: 0,
    bestFinish: 'Çeyrek Final (1970, 1986)',
    totalAppearances: 17,
    funFacts: [
      'En iyi dereceleri ev sahipliği yaptıkları 1970 ve 1986’daki çeyrek finaller.',
      '2026’ya ev sahibi ülkelerden biri olarak katılacak.',
    ],
  },
  {
    displayName: 'ABD',
    squadValue: '~€300M',
    avgAge: 25.5,
    starPlayer: { name: 'Christian Pulisic', club: 'Milan', value: '~€45M' },
    titles: 0,
    bestFinish: 'Üçüncü (1930)',
    totalAppearances: 11,
    funFacts: [
      'İlk Dünya Kupası’nda (1930) üçüncü olarak en iyi derecesini elde etti.',
      '2026’ya ev sahibi ülkelerden biri olarak katılacak.',
    ],
  },
];

/** Normalize edilmiş ad → profil (takma adlarla birlikte) */
const PROFILE_BY_KEY: Record<string, WorldCupTeamProfile> = {};

const ALIASES: Record<string, string[]> = {
  'Türkiye': ['turkey', 'turkiye'],
  'Brezilya': ['brazil', 'brasil'],
  'Almanya': ['germany', 'deutschland'],
  'Fransa': ['france'],
  'Arjantin': ['argentina'],
  'İspanya': ['spain', 'espana'],
  'İngiltere': ['england'],
  'Portekiz': ['portugal'],
  'Hollanda': ['netherlands', 'holland'],
  'Belçika': ['belgium'],
  'İtalya': ['italy', 'italia'],
  'Japonya': ['japan'],
  'Fas': ['morocco', 'maroc'],
  'Meksika': ['mexico'],
  'ABD': ['usa', 'unitedstates', 'unitedstatesofamerica', 'us'],
};

for (const profile of PROFILES) {
  PROFILE_BY_KEY[normalizeTeamName(profile.displayName)] = profile;
  for (const alias of ALIASES[profile.displayName] ?? []) {
    PROFILE_BY_KEY[normalizeTeamName(alias)] = profile;
  }
}

/** LiveScore takım adından künye getir; bulunamazsa null. */
export function getWorldCupTeamProfile(teamName: string | null | undefined): WorldCupTeamProfile | null {
  if (!teamName) return null;
  return PROFILE_BY_KEY[normalizeTeamName(teamName)] ?? null;
}
