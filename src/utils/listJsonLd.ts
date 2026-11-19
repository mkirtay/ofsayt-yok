/**
 * Liste / koleksiyon sayfaları için schema.org yapısal verisi (2026-11-20 denetimi S7): /lig dizini, /bugun öne çıkan
 * maçlar, /ai-istatistikleri isabet veri seti, /frikik oyunu. Yalnız sayfada zaten olan veri; ek istek yok.
 */
import { BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';

export type ListEntry = { name: string; url: string };

/** ItemList — sıralı bağlantı listesi (ListItem: konum + ad + adres). */
export function itemListJsonLd(name: string, entries: ListEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.name, url: e.url })),
  };
}

export type ListedMatch = { href: string; home: { name: string }; away: { name: string }; competition: { name: string }; time?: string };

/** Günün maçları: ItemList > SportsEvent. `time` TSİ "HH:MM" → TSİ ofsetli ISO; saat yoksa yalnız tarih. */
export function matchListJsonLd(name: string, dateIso: string, matches: ListedMatch[]): Record<string, unknown> {
  const base = siteBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: matches.length,
    itemListElement: matches.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'SportsEvent',
        name: `${m.home.name} - ${m.away.name}`,
        url: `${base}${m.href}`,
        sport: 'Soccer',
        startDate: m.time && /^\d{2}:\d{2}$/.test(m.time) ? `${dateIso}T${m.time}:00+03:00` : dateIso,
        homeTeam: { '@type': 'SportsTeam', name: m.home.name },
        awayTeam: { '@type': 'SportsTeam', name: m.away.name },
        ...(m.competition.name ? { superEvent: { '@type': 'SportsEvent', name: m.competition.name } } : {}),
      },
    })),
  };
}

export type AccuracyMonth = { month: string; matches: number; picks: number; hits: number; rate: number };

/**
 * AI isabet veri seti: ölçülen değişkenler + aylık dağılım. `dateModified` son değerlendirmenin tarihi (veriden —
 * ISR props deterministik kalsın diye "şimdi" kullanılmaz).
 */
export function accuracyDatasetJsonLd(opts: {
  name: string;
  description: string;
  url: string;
  months: AccuracyMonth[];
  lastEvaluatedAt?: string | null;
}): Record<string, unknown> {
  const months = [...opts.months].sort((a, b) => a.month.localeCompare(b.month));
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    creator: { '@type': 'Organization', name: BRAND.name, url: `${siteBaseUrl()}/` },
    isAccessibleForFree: true,
    inLanguage: 'tr-TR',
    variableMeasured: ['değerlendirilen maç', 'tahmin', 'tutan tahmin', 'isabet oranı (%)'],
    ...(months.length ? { temporalCoverage: `${months[0]!.month}/${months[months.length - 1]!.month}` } : {}),
    ...(opts.lastEvaluatedAt ? { dateModified: opts.lastEvaluatedAt.slice(0, 10) } : {}),
  };
}

/** /frikik — tarayıcıda oynanan ücretsiz oyun. */
export function webGameJsonLd(opts: { name: string; description: string; url: string; image?: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    ...(opts.image ? { image: opts.image } : {}),
    genre: 'Spor',
    gamePlatform: 'Web tarayıcısı',
    playMode: 'SinglePlayer',
    applicationCategory: 'Game',
    inLanguage: 'tr-TR',
    isAccessibleForFree: true,
    publisher: { '@type': 'Organization', name: BRAND.name, url: `${siteBaseUrl()}/` },
  };
}
