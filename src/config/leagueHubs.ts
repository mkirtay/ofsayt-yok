/**
 * /lig/{slug} SEO sayfaları: Türkçe aramada en çok aranan ligler ("süper lig puan durumu", "premier lig gol krallığı").
 * Slug Türkçe ve kalıcı (URL değişirse sıralama kaybolur) — değiştirme, yalnız ekle.
 */
export type LeagueHub = {
  slug: string;
  /** Sportmonks lig id'si. */
  leagueId: number;
  /** Sayfa başlığında / H1'de kullanılan Türkçe ad. */
  name: string;
  /** Lig ülkesi / bölgesi (özet cümlesi). */
  region: string;
};

export const LEAGUE_HUBS: readonly LeagueHub[] = [
  { slug: 'super-lig', leagueId: 600, name: 'Süper Lig', region: 'Türkiye' },
  { slug: '1-lig', leagueId: 603, name: '1. Lig', region: 'Türkiye' },
  { slug: 'premier-lig', leagueId: 8, name: 'Premier Lig', region: 'İngiltere' },
  { slug: 'la-liga', leagueId: 564, name: 'La Liga', region: 'İspanya' },
  { slug: 'serie-a', leagueId: 384, name: 'Serie A', region: 'İtalya' },
  { slug: 'bundesliga', leagueId: 82, name: 'Bundesliga', region: 'Almanya' },
  { slug: 'ligue-1', leagueId: 301, name: 'Ligue 1', region: 'Fransa' },
  { slug: 'sampiyonlar-ligi', leagueId: 2, name: 'Şampiyonlar Ligi', region: 'Avrupa' },
  { slug: 'avrupa-ligi', leagueId: 5, name: 'Avrupa Ligi', region: 'Avrupa' },
  { slug: 'konferans-ligi', leagueId: 2286, name: 'Konferans Ligi', region: 'Avrupa' },
  { slug: 'eredivisie', leagueId: 72, name: 'Eredivisie', region: 'Hollanda' },
  { slug: 'liga-portugal', leagueId: 462, name: 'Liga Portugal', region: 'Portekiz' },
  { slug: 'championship', leagueId: 9, name: 'Championship', region: 'İngiltere' },
  { slug: 'suudi-pro-lig', leagueId: 944, name: 'Suudi Arabistan Pro Lig', region: 'Suudi Arabistan' },
];

export function leagueHubBySlug(slug: string): LeagueHub | undefined {
  return LEAGUE_HUBS.find((h) => h.slug === slug);
}

export function leagueHubByLeagueId(leagueId: number | null | undefined): LeagueHub | undefined {
  return leagueId == null ? undefined : LEAGUE_HUBS.find((h) => h.leagueId === leagueId);
}
