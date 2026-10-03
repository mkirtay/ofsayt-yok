/**
 * Ana sayfa yan paneli "Ligler" sekmesi (mobilde alt menüdeki Ligler): planımızdaki 34 ligin TAMAMI, gruplu.
 * Kaynak `config/leagueNameKeys.ts` (lig id → ad anahtarı); burada yalnızca grup, sıra ve ülke var.
 * Yeni Sportmonks isteği yok — logo deterministik CDN yolundan, maç sayısı ekrandaki günün verisinden.
 *
 * Grup sırası: Türkiye → Avrupa Kupaları → 5 Büyük Lig → Diğer Avrupa (ülke adına göre alfabetik) → Amerika → Diğer.
 * Ülke adları burada iki dilde: aramada "arjantin" de "argentina" da bulsun (iki dilin adı birlikte aranır).
 */
import { SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';
import { normalizeSearchText } from '@/utils/searchText';

export type HubLeagueGroupKey = 'turkey' | 'europeCups' | 'bigFive' | 'otherEurope' | 'americas' | 'other';

export const HUB_LEAGUE_GROUP_ORDER: readonly HubLeagueGroupKey[] = ['turkey', 'europeCups', 'bigFive', 'otherEurope', 'americas', 'other'];

type CountryName = { tr: string; en: string };

const C = {
  turkey: { tr: 'Türkiye', en: 'Turkey' },
  europe: { tr: 'Avrupa', en: 'Europe' },
  england: { tr: 'İngiltere', en: 'England' },
  germany: { tr: 'Almanya', en: 'Germany' },
  spain: { tr: 'İspanya', en: 'Spain' },
  italy: { tr: 'İtalya', en: 'Italy' },
  france: { tr: 'Fransa', en: 'France' },
  netherlands: { tr: 'Hollanda', en: 'Netherlands' },
  belgium: { tr: 'Belçika', en: 'Belgium' },
  czechia: { tr: 'Çekya', en: 'Czechia' },
  denmark: { tr: 'Danimarka', en: 'Denmark' },
  greece: { tr: 'Yunanistan', en: 'Greece' },
  portugal: { tr: 'Portekiz', en: 'Portugal' },
  scotland: { tr: 'İskoçya', en: 'Scotland' },
  sweden: { tr: 'İsveç', en: 'Sweden' },
  switzerland: { tr: 'İsviçre', en: 'Switzerland' },
  ukraine: { tr: 'Ukrayna', en: 'Ukraine' },
  brazil: { tr: 'Brezilya', en: 'Brazil' },
  argentina: { tr: 'Arjantin', en: 'Argentina' },
  usa: { tr: 'ABD', en: 'USA' },
  saudiArabia: { tr: 'Suudi Arabistan', en: 'Saudi Arabia' },
} satisfies Record<string, CountryName>;

type HubLeagueDef = { id: number; group: HubLeagueGroupKey; country: CountryName };

/**
 * Sabit gruplarda (Diğer Avrupa hariç) sıra bu dizinin sırası. Diğer Avrupa'da ülke adına göre alfabetik, aynı ülkede
 * bu dizinin sırası (lig → alt lig → kupa).
 */
const HUB_LEAGUE_DEFS: readonly HubLeagueDef[] = [
  // Türkiye: Süper Lig, 1. Lig, 2. Lig'ler, Türkiye Kupası
  { id: 600, group: 'turkey', country: C.turkey },
  { id: 603, group: 'turkey', country: C.turkey },
  { id: 1282, group: 'turkey', country: C.turkey },
  { id: 1283, group: 'turkey', country: C.turkey },
  { id: 606, group: 'turkey', country: C.turkey },
  // Avrupa Kupaları
  { id: 2, group: 'europeCups', country: C.europe },
  { id: 5, group: 'europeCups', country: C.europe },
  { id: 2286, group: 'europeCups', country: C.europe },
  { id: 1328, group: 'europeCups', country: C.europe },
  // 5 Büyük Lig (lig filtresi / maç listesiyle aynı sıra: İngiltere, Almanya, İspanya, İtalya, Fransa)
  { id: 8, group: 'bigFive', country: C.england },
  { id: 82, group: 'bigFive', country: C.germany },
  { id: 564, group: 'bigFive', country: C.spain },
  { id: 384, group: 'bigFive', country: C.italy },
  { id: 301, group: 'bigFive', country: C.france },
  // Diğer Avrupa
  { id: 9, group: 'otherEurope', country: C.england },
  { id: 85, group: 'otherEurope', country: C.germany },
  { id: 567, group: 'otherEurope', country: C.spain },
  { id: 570, group: 'otherEurope', country: C.spain },
  { id: 387, group: 'otherEurope', country: C.italy },
  { id: 304, group: 'otherEurope', country: C.france },
  { id: 72, group: 'otherEurope', country: C.netherlands },
  { id: 208, group: 'otherEurope', country: C.belgium },
  { id: 262, group: 'otherEurope', country: C.czechia },
  { id: 271, group: 'otherEurope', country: C.denmark },
  { id: 325, group: 'otherEurope', country: C.greece },
  { id: 462, group: 'otherEurope', country: C.portugal },
  { id: 501, group: 'otherEurope', country: C.scotland },
  { id: 573, group: 'otherEurope', country: C.sweden },
  { id: 591, group: 'otherEurope', country: C.switzerland },
  { id: 609, group: 'otherEurope', country: C.ukraine },
  // Amerika: Brezilya, Arjantin, MLS
  { id: 648, group: 'americas', country: C.brazil },
  { id: 636, group: 'americas', country: C.argentina },
  { id: 779, group: 'americas', country: C.usa },
  // Diğer
  { id: 944, group: 'other', country: C.saudiArabia },
];

export type HubLeagueRow = {
  /** Sportmonks league_id */
  id: number;
  /** Görünen (kısa) ad — `leagues.short.*` */
  name: string;
  /** Görünen dilde ülke adı */
  country: string;
  /** Ülke adı lig adında zaten geçmiyorsa göster ("Belçika Pro Ligi" → tekrar yok). */
  showCountry: boolean;
  /** Aramada eşleşen metin (normalize): iki dilde ülke + lig adları + grup başlığı. */
  searchText: string;
};

export type HubLeagueGroup = { key: HubLeagueGroupKey; title: string; leagues: HubLeagueRow[] };

/** `useTranslation('leagues').t` ile aynı imza. */
type Translate = (key: string) => string;

/** Kısa ad (`short.<key>`); çeviri yoksa anahtar döner → yine de bir ad olsun diye anahtarın kendisi yerine id. */
function shortName(id: number, t: Translate): string {
  const key = SPORTMONKS_LEAGUE_NAME_KEYS[id];
  if (!key) return String(id);
  const v = t(`short.${key}`);
  return v === `short.${key}` ? key : v;
}

/** 34 lig, grup ve sırasıyla. `t` = leagues namespace'i; `locale` ülke adının dili ve Diğer Avrupa sıralaması için. */
export function buildHubLeagueGroups(t: Translate, locale: string): HubLeagueGroup[] {
  const lang: keyof CountryName = locale === 'en' ? 'en' : 'tr';
  const collator = new Intl.Collator(lang === 'en' ? 'en' : 'tr');
  return HUB_LEAGUE_GROUP_ORDER.map((key) => {
    const title = t(`groups.${key}`);
    const defs = HUB_LEAGUE_DEFS.filter((d) => d.group === key);
    const ordered =
      key === 'otherEurope'
        ? defs
            .map((d, i) => ({ d, i }))
            .sort((a, b) => collator.compare(a.d.country[lang], b.d.country[lang]) || a.i - b.i)
            .map((x) => x.d)
        : defs;
    const leagues = ordered.map((d): HubLeagueRow => {
      const name = shortName(d.id, t);
      const country = d.country[lang];
      return {
        id: d.id,
        name,
        country,
        showCountry: key !== 'turkey' && key !== 'europeCups' && !normalizeSearchText(name).includes(normalizeSearchText(country)),
        searchText: normalizeSearchText(`${name} ${d.country.tr} ${d.country.en} ${title}`),
      };
    });
    return { key, title, leagues };
  });
}

/** Lig ve ülke adında (iki dilde) arama; Türkçe karakter ve büyük/küçük harf duyarsız. Boş grup düşer. */
export function filterHubLeagueGroups(groups: HubLeagueGroup[], query: string): HubLeagueGroup[] {
  const q = normalizeSearchText(query);
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, leagues: g.leagues.filter((l) => l.searchText.includes(q)) }))
    .filter((g) => g.leagues.length > 0);
}

/** Tanımlı bütün lig id'leri (sırasız) — testler ve giriş sahnesindeki top logoları (AuthStage). */
export const HUB_LEAGUE_IDS: readonly number[] = HUB_LEAGUE_DEFS.map((d) => d.id);
