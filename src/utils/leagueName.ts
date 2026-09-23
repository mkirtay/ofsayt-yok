/**
 * Küratörlü lig adlarının i18n çözümü.
 *
 * Yalnızca `config/leagues.ts`'teki BİLİNEN ligler çevrilir; API'den gelen ligler (maç listesi grup
 * başlıkları, lig kataloğundaki "bilinmeyen" satırlar) Sportmonks'un kendi adıyla kalır — onlar için
 * elimizde çeviri yok ve uydurmak yanlış lig adı göstermek olurdu.
 */

import type { SidebarLeague } from '@/config/leagues';
import { SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

/** `useTranslation('leagues').t` ile aynı imza. */
export type LeagueTranslate = (key: string, opts?: Record<string, unknown>) => string;

type NamedLeague = Pick<SidebarLeague, 'nameKey' | 'name'>;

/**
 * `lib/i18n`'deki `t`, anahtar bulunamazsa ANAHTARIN KENDİSİNİ döndürüyor. Bu yüzden dönen değer
 * anahtara eşitse çeviri yok demektir → config'teki Türkçe ada düşülür (boş metin gösterilmez).
 */
export function leagueDisplayName(league: NamedLeague, t: LeagueTranslate): string {
  if (!league.nameKey) return league.name;
  const value = t(league.nameKey);
  return value === league.nameKey ? league.name : value;
}

/** Aramada hem çevrilmiş hem yedek ad eşleşsin diye ikisini birden verir ("Premier" iki dilde de bulsun). */
export function leagueSearchTerms(league: NamedLeague, t: LeagueTranslate): string {
  const translated = leagueDisplayName(league, t);
  return translated === league.name ? league.name : `${translated} ${league.name}`;
}

/**
 * Sportmonks `league_id` ile satır içi (kısa) lig adı: tr "Süper Lig" / "Şampiyonlar Ligi", en "Süper Lig" / "Champions League".
 * `t` = `useTranslation('leagues').t`. Eşlemesi ya da çevirisi olmayan lig → API adı (sessiz yedek).
 * Sportmonks kapalıyken id legacy `competition_id` olur (2 = Premier Lig, Sportmonks'ta 2 = UCL) → eşleme yapılmaz.
 * Kullanım yerleri: takım detay başlığı + Puan Durumu başlığı + Ligler sekmesi, takım Fikstür satırı, maç detay kartı başlığı.
 */
export function leagueNameById(
  leagueId: number | string | null | undefined,
  apiName: string | null | undefined,
  t: LeagueTranslate,
): string {
  const key =
    leagueId != null && isSportmonksProviderEnabled() ? SPORTMONKS_LEAGUE_NAME_KEYS[Number(leagueId)] : undefined;
  if (key) {
    const k = `short.${key}`;
    const value = t(k);
    if (value !== k) return value;
  }
  return apiName?.trim() ?? '';
}
