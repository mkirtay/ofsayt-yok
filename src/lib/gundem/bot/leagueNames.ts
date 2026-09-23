/**
 * Sportmonks lig adı → Türkçe kullanıcıya gösterilen ad (yalnızca GÖRÜNTÜLEME). API adı ("Super Lig") İngilizce/ASCII geliyor.
 * Anahtar Sportmonks `league_id` (adlar değişebilir). Eşleme web arayüzüyle ORTAK: `config/leagueNameKeys.ts` +
 * `public/locales/tr/leagues.json` `short.*` (bkz. `utils/leagueName.ts` `leagueNameById`). Bilinmeyen lig → API adı (uydurma ad yok).
 */
import { SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';
import trLeagues from '../../../../public/locales/tr/leagues.json';

const TR_SHORT = trLeagues.short as Record<string, string>;

export function leagueDisplayName(leagueId: number | null | undefined, apiName: string | null | undefined): string | null {
  const key = leagueId != null ? SPORTMONKS_LEAGUE_NAME_KEYS[leagueId] : undefined;
  if (key && TR_SHORT[key]) return TR_SHORT[key];
  return apiName?.trim() || null;
}
