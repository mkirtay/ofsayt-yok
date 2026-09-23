/**
 * Ana sayfa lig gruplarının sırası (yan panel `SIDEBAR_LEAGUES`):
 * 1) Türkiye
 * 2) Büyük 5 (ES, EN, IT, FR, DE)
 * 3) UEFA üçlüsü (`UEFA_SIDEBAR_LEAGUES`) — yan panelde `HOME_SIDEBAR_LEAGUES` ile en sonda listelenir;
 *    ayrıca lig filtresi/logolar için kullanılır. Ayrı bir /uefa sayfası YOK (kaldırıldı, geri getirilmedi).
 *
 * Maç listesi gruplama sırası (`compareGroupedLeagues`): tier 0 World Cup (güncel/gündemdeki
 * turnuva), tier 2 UEFA hâlâ Ş→Avrupa→Konferans.
 */

import { WORLD_CUP_COMPETITION_ID } from './worldCup';
import { compareLeaguePriority } from './leaguePriority';
import { isSportmonksProviderEnabled, resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';

export type LeagueGroupSortInput = {
  competition_id: number;
  competition_name: string;
  country_id?: number;
  country_name?: string;
};

/** `match.country.id` — Live Score’da Türkiye çoğunlukla 17; gerekirse doğrula */
export const TURKEY_COUNTRY_ID = 48;

/** Ülke alanı yoksa yedek: bilinen Türkiye lig competition_id’leri */
export const TURKEY_COMPETITION_IDS = [6, 344, 347];

/** Live Score `competition.id` — Postman ile doğrula */
export const UEFA_CHAMPIONS_LEAGUE_ID = 244;
export const UEFA_EUROPA_LEAGUE_ID = 245;
export const UEFA_CONFERENCE_LEAGUE_ID = 446;

/** Sıra: Şampiyonlar → Avrupa → Konferans */
export const UEFA_TIER2_COMPETITION_IDS = [
  UEFA_CHAMPIONS_LEAGUE_ID,
  UEFA_EUROPA_LEAGUE_ID,
  UEFA_CONFERENCE_LEAGUE_ID,
];

/**
 * Büyük 5 — sıra: İngiltere, Almanya, İspanya, İtalya, Fransa
 * Premier League, Bundesliga, La Liga, Serie A, Ligue 1
 */
export const BIG_FIVE_COMPETITION_ORDER = [2, 1, 3, 4, 5];

function isTurkeyGroup(g: LeagueGroupSortInput): boolean {
  if (g.country_id === TURKEY_COUNTRY_ID) return true;
  const n = (g.country_name || '').toLowerCase();
  if (n === 'turkey' || n === 'türkiye' || n === 'turkiye') return true;
  return TURKEY_COMPETITION_IDS.includes(g.competition_id);
}

function turkeyLeagueOrder(competitionId: number): number {
  const order = TURKEY_COMPETITION_IDS;
  const i = order.indexOf(competitionId);
  return i >= 0 ? i : 500;
}

function uefaTier2Order(competitionId: number): number {
  const i = UEFA_TIER2_COMPETITION_IDS.indexOf(competitionId);
  return i >= 0 ? i : 999;
}

function bigFiveOrder(competitionId: number): number {
  const i = BIG_FIVE_COMPETITION_ORDER.indexOf(competitionId);
  return i >= 0 ? i : 999;
}

function isWorldCupGroup(g: LeagueGroupSortInput): boolean {
  return g.competition_id === WORLD_CUP_COMPETITION_ID;
}

function getTier(g: LeagueGroupSortInput): number {
  if (isWorldCupGroup(g)) return 0;
  if (isTurkeyGroup(g)) return 1;
  if (uefaTier2Order(g.competition_id) < 999) return 2;
  if (bigFiveOrder(g.competition_id) < 999) return 3;
  return 4;
}

function nameCompare(a: LeagueGroupSortInput, b: LeagueGroupSortInput): number {
  return (a.competition_name || '').localeCompare(b.competition_name || '', 'tr');
}

export type SidebarLeague = {
  id: number;
  /**
   * `public/locales/{tr,en}/leagues.json` anahtarı — GÖSTERİLEN ad buradan gelir
   * (bkz. `utils/leagueName.ts`). `name` yalnızca yedek/arama içindir.
   */
  nameKey: string;
  /** Türkçe yedek ad: çeviri anahtarı bulunamazsa ve arama eşleşmesinde kullanılır. */
  name: string;
  /** country_id for flag via API proxy; null = use static logo */
  countryId: number | null;
  /** Static logo (UEFA cups: local svg; domestic leagues: Sportmonks CDN `image_path`) */
  logo?: string;
};

export const SIDEBAR_LEAGUES: SidebarLeague[] = [
  { id: 6,   nameKey: 'superLig',        name: 'Trendyol Süper Lig',    countryId: 48, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/24/600.png' },
  { id: 344, nameKey: 'tffFirstLeague',  name: 'Trendyol 1. Lig',        countryId: 48, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/27/603.png' },
  { id: 347, nameKey: 'turkishCup',      name: 'Türkiye Kupası',          countryId: 48, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/30/606.png' },
  { id: 2,   nameKey: 'premierLeague',   name: 'İngiltere Premier Lig',   countryId: 19, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/8/8.png' },
  { id: 1,   nameKey: 'bundesliga',      name: 'Almanya Bundesliga',      countryId: 1, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/18/82.png' },
  { id: 3,   nameKey: 'laLiga',          name: 'İspanya La Liga',         countryId: 43, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/20/564.png' },
  { id: 4,   nameKey: 'serieA',          name: 'İtalya Serie A',          countryId: 47, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/0/384.png' },
  { id: 5,   nameKey: 'ligue1',          name: 'Fransa Ligue 1',          countryId: 21, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/13/301.png' },
];

export type CountryLeagueGroup = {
  countryName: string;
  countryId: number | null;
  leagues: SidebarLeague[];
};

/** Karşılaştırma seçici için ülke→lig hiyerarşisi (bilinen ve doğrulanmış ID'ler) */
export const COMPARE_LEAGUE_GROUPS: CountryLeagueGroup[] = [
  {
    countryName: 'Türkiye',
    countryId: 48,
    leagues: [
      { id: 6,   nameKey: 'superLig',       name: 'Trendyol Süper Lig', countryId: 48 },
      { id: 344, nameKey: 'tffFirstLeague', name: 'Trendyol 1. Lig',    countryId: 48 },
    ],
  },
  {
    countryName: 'İngiltere',
    countryId: 19,
    leagues: [
      { id: 2, nameKey: 'premierLeague', name: 'Premier League', countryId: 19 },
    ],
  },
  {
    countryName: 'Almanya',
    countryId: 1,
    leagues: [
      { id: 1, nameKey: 'bundesliga', name: 'Bundesliga', countryId: 1 },
    ],
  },
  {
    countryName: 'İspanya',
    countryId: 43,
    leagues: [
      { id: 3, nameKey: 'laLiga', name: 'La Liga', countryId: 43 },
    ],
  },
  {
    countryName: 'İtalya',
    countryId: 47,
    leagues: [
      { id: 4, nameKey: 'serieA', name: 'Serie A', countryId: 47 },
    ],
  },
  {
    countryName: 'Fransa',
    countryId: 21,
    leagues: [
      { id: 5, nameKey: 'ligue1', name: 'Ligue 1', countryId: 21 },
    ],
  },
  {
    countryName: 'UEFA',
    countryId: null,
    leagues: [
      { id: 244, nameKey: 'championsLeague',   name: 'Şampiyonlar Ligi',   countryId: null, logo: '/images/uefa-logo.svg' },
      { id: 245, nameKey: 'europaLeague',      name: 'UEFA Avrupa Ligi',   countryId: null, logo: '/images/uefa-logo.svg' },
      { id: 446, nameKey: 'conferenceLeague',  name: 'UEFA Konferans Ligi',countryId: null, logo: '/images/uefa-logo.svg' },
    ],
  },
];

/** UEFA kupaları (lig filtresi kataloğu) — sıra `UEFA_TIER2_COMPETITION_IDS` ile aynı */
export const UEFA_SIDEBAR_LEAGUES: SidebarLeague[] = [
  { id: UEFA_CHAMPIONS_LEAGUE_ID, nameKey: 'championsLeague', name: 'Şampiyonlar Ligi', countryId: null, logo: '/images/uefa-logo.svg' },
  { id: UEFA_EUROPA_LEAGUE_ID, nameKey: 'europaLeague', name: 'UEFA Avrupa Ligi', countryId: null, logo: '/images/uefa-logo.svg' },
  { id: UEFA_CONFERENCE_LEAGUE_ID, nameKey: 'conferenceLeague', name: 'UEFA Konferans Ligi', countryId: null, logo: '/images/uefa-logo.svg' },
];

/**
 * Ana sayfa yan panelindeki "Ligler" sekmesinin TAM listesi: önce yurt içi (Süper Lig → 5 büyük),
 * sonra UEFA kupaları. UEFA satırına tıklanınca maç listesi o kupanın TARİH GRUPLU fikstürüne geçer
 * (bkz. `MatchHubPage`); ayrı bir /uefa sayfası YOK — kasıtlı olarak kaldırıldı.
 *
 * `SIDEBAR_LEAGUES` ayrı bırakıldı: `[...SIDEBAR_LEAGUES, ...UEFA_SIDEBAR_LEAGUES]` şeklinde
 * birleştiren yerler (lig kataloğu, favoriler sekmesi) UEFA'yı iki kez saymasın.
 */
export const HOME_SIDEBAR_LEAGUES: SidebarLeague[] = [...SIDEBAR_LEAGUES, ...UEFA_SIDEBAR_LEAGUES];

/** Legacy `competition_id` bir UEFA kulüp kupası mı (Ş. Ligi / Avrupa Ligi / Konferans Ligi)? */
export function isUefaCupCompetitionId(competitionId: number | null | undefined): boolean {
  return competitionId != null && UEFA_TIER2_COMPETITION_IDS.includes(competitionId);
}

/** Gruptaki `competition_id` → Sportmonks league_id (Sportmonks açıkken zaten o; kapalıyken legacy → eşleme). */
function toSportmonksLeagueId(competitionId: number): number | null {
  return isSportmonksProviderEnabled() ? competitionId : resolveSportmonksLeagueId(competitionId);
}

export function compareGroupedLeagues(a: LeagueGroupSortInput, b: LeagueGroupSortInput): number {
  // World Cup (varsa) her zaman önde — yalnızca legacy id'de var.
  const wa = isWorldCupGroup(a);
  const wb = isWorldCupGroup(b);
  if (wa !== wb) return wa ? -1 : 1;
  if (wa && wb) return nameCompare(a, b);

  const ia = toSportmonksLeagueId(a.competition_id);
  const ib = toSportmonksLeagueId(b.competition_id);
  // Kademe ayrımı yalnızca Sportmonks lig id'sinden yapılabilir (bkz. leaguePriority.ts). Eşleme yoksa eski sıralama.
  if (ia != null && ib != null) {
    return compareLeaguePriority(
      { leagueId: ia, competition_name: a.competition_name, country_name: a.country_name },
      { leagueId: ib, competition_name: b.competition_name, country_name: b.country_name },
    );
  }
  return compareGroupedLeaguesLegacy(a, b);
}

function compareGroupedLeaguesLegacy(a: LeagueGroupSortInput, b: LeagueGroupSortInput): number {
  const tierA = getTier(a);
  const tierB = getTier(b);
  if (tierA !== tierB) return tierA - tierB;

  if (tierA === 0) return nameCompare(a, b);

  if (tierA === 1) {
    const oa = turkeyLeagueOrder(a.competition_id);
    const ob = turkeyLeagueOrder(b.competition_id);
    if (oa !== ob) return oa - ob;
    return nameCompare(a, b);
  }

  if (tierA === 2) {
    const oa = uefaTier2Order(a.competition_id);
    const ob = uefaTier2Order(b.competition_id);
    if (oa !== ob) return oa - ob;
    return nameCompare(a, b);
  }

  if (tierA === 3) {
    const oa = bigFiveOrder(a.competition_id);
    const ob = bigFiveOrder(b.competition_id);
    if (oa !== ob) return oa - ob;
    return nameCompare(a, b);
  }

  const byCountry = (a.country_name || '').localeCompare(b.country_name || '', 'tr');
  if (byCountry !== 0) return byCountry;
  return nameCompare(a, b);
}
