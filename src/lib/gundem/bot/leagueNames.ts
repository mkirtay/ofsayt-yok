/**
 * Sportmonks lig adı → Türkçe kullanıcıya gösterilen ad (yalnızca GÖRÜNTÜLEME). API adı ("Super Lig") İngilizce/ASCII geliyor.
 * Anahtar Sportmonks `league_id` (adlar değişebilir; id'ler `config/leagues.ts` logo yollarıyla ve `sportmonksProviderFlag.ts`
 * doğrulamalarıyla tutarlı). Bilinmeyen lig → API adı olduğu gibi kalır (uydurma ad yok).
 */
const LEAGUE_DISPLAY_NAMES: Record<number, string> = {
  600: 'Süper Lig',
  603: '1. Lig',
  606: 'Türkiye Kupası',
  8: 'Premier League',
  82: 'Bundesliga',
  564: 'La Liga',
  384: 'Serie A',
  301: 'Ligue 1',
  2: 'Şampiyonlar Ligi',
  5: 'UEFA Avrupa Ligi',
  2286: 'UEFA Konferans Ligi',
};

export function leagueDisplayName(leagueId: number | null | undefined, apiName: string | null | undefined): string | null {
  if (leagueId != null && LEAGUE_DISPLAY_NAMES[leagueId]) return LEAGUE_DISPLAY_NAMES[leagueId];
  return apiName?.trim() || null;
}
