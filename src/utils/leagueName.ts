/**
 * Küratörlü lig adlarının i18n çözümü.
 *
 * Yalnızca `config/leagues.ts`'teki BİLİNEN ligler çevrilir; API'den gelen ligler (maç listesi grup
 * başlıkları, lig kataloğundaki "bilinmeyen" satırlar) Sportmonks'un kendi adıyla kalır — onlar için
 * elimizde çeviri yok ve uydurmak yanlış lig adı göstermek olurdu.
 */

import type { SidebarLeague } from '@/config/leagues';

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
