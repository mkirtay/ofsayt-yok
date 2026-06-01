/**
 * Tek kaynak takım kaydı (single source of truth).
 *
 * Önceden Transfermarkt yolları ve FBref isimleri hem `config.ts` hem de
 * `scrapers/transfermarkt.ts` ve `scrapers/fbref.ts` içinde ayrı ayrı tekrarlanıyordu.
 * Bu durum drift'e yol açıyordu (ör. Hollanda yanlışlıkla Fransa'nın verein/3377 ID'sine
 * eşlenmişti). Artık tüm scraper'lar bu tek tabloyu kullanır.
 */

export interface TeamSource {
  /** Transfermarkt milli takım yolu: `<ulke>/startseite/verein/<id>` */
  transfermarkt: string;
  /** FBref'teki İngilizce milli takım adı */
  fbref: string;
}

export const TEAM_SOURCES: Record<string, TeamSource> = {
  'türkiye': { transfermarkt: 'tuerkei/startseite/verein/141', fbref: 'Turkey' },
  'turkey': { transfermarkt: 'tuerkei/startseite/verein/141', fbref: 'Turkey' },
  'brezilya': { transfermarkt: 'brasilien/startseite/verein/26', fbref: 'Brazil' },
  'brazil': { transfermarkt: 'brasilien/startseite/verein/26', fbref: 'Brazil' },
  'almanya': { transfermarkt: 'deutschland/startseite/verein/27', fbref: 'Germany' },
  'germany': { transfermarkt: 'deutschland/startseite/verein/27', fbref: 'Germany' },
  'fransa': { transfermarkt: 'frankreich/startseite/verein/3377', fbref: 'France' },
  'france': { transfermarkt: 'frankreich/startseite/verein/3377', fbref: 'France' },
  'arjantin': { transfermarkt: 'argentinien/startseite/verein/3437', fbref: 'Argentina' },
  'argentina': { transfermarkt: 'argentinien/startseite/verein/3437', fbref: 'Argentina' },
  'ispanya': { transfermarkt: 'spanien/startseite/verein/3375', fbref: 'Spain' },
  'spain': { transfermarkt: 'spanien/startseite/verein/3375', fbref: 'Spain' },
  'İngiltere': { transfermarkt: 'england/startseite/verein/3', fbref: 'England' },
  'england': { transfermarkt: 'england/startseite/verein/3', fbref: 'England' },
  'portekiz': { transfermarkt: 'portugal/startseite/verein/3469', fbref: 'Portugal' },
  'portugal': { transfermarkt: 'portugal/startseite/verein/3469', fbref: 'Portugal' },
  // FIX: Hollanda önceden Fransa'nın 3377 ID'sine eşlenmişti → doğrusu 3379
  'hollanda': { transfermarkt: 'niederlande/startseite/verein/3379', fbref: 'Netherlands' },
  'netherlands': { transfermarkt: 'niederlande/startseite/verein/3379', fbref: 'Netherlands' },
  'belçika': { transfermarkt: 'belgien/startseite/verein/3382', fbref: 'Belgium' },
  'belgium': { transfermarkt: 'belgien/startseite/verein/3382', fbref: 'Belgium' },
  'italya': { transfermarkt: 'italien/startseite/verein/3376', fbref: 'Italy' },
  'italy': { transfermarkt: 'italien/startseite/verein/3376', fbref: 'Italy' },
  'japonya': { transfermarkt: 'japan/startseite/verein/40', fbref: 'Japan' },
  'japan': { transfermarkt: 'japan/startseite/verein/40', fbref: 'Japan' },
  'fas': { transfermarkt: 'marokko/startseite/verein/44', fbref: 'Morocco' },
  'morocco': { transfermarkt: 'marokko/startseite/verein/44', fbref: 'Morocco' },
  'meksika': { transfermarkt: 'mexiko/startseite/verein/35', fbref: 'Mexico' },
  'mexico': { transfermarkt: 'mexiko/startseite/verein/35', fbref: 'Mexico' },
  'abd': { transfermarkt: 'vereinigte-staaten/startseite/verein/3438', fbref: 'United States' },
  'usa': { transfermarkt: 'vereinigte-staaten/startseite/verein/3438', fbref: 'United States' },
};

export function getTeamSource(team: string): TeamSource | null {
  return TEAM_SOURCES[team.toLowerCase()] ?? null;
}
