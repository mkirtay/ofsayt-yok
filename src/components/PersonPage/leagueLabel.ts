import { SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';

/**
 * Hakem / teknik direktör sayfalarında lig adı: id'ler her zaman Sportmonks `league_id` (istatistik kayıtları) → ad
 * anahtarı tablosundan `leagues.short.*`; eşleme yoksa API adı ya da "—". (`leagueNameById` sağlayıcı bayrağına bağlı.)
 */
export function personLeagueLabel(leagueId: number | null | undefined, t: (key: string) => string, fallback = '—'): string {
  const key = leagueId != null ? SPORTMONKS_LEAGUE_NAME_KEYS[leagueId] : undefined;
  if (!key) return fallback;
  const v = t(`short.${key}`);
  return v === `short.${key}` ? fallback : v;
}
