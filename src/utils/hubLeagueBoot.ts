/**
 * Ana sayfa yan panelinde hatırlanan lig (bkz. hubLeaguePreference.ts) yenilemede.
 *
 * Sayfa ISR: sunucu HTML'i varsayılan ligle (Süper Lig) gelir; hatırlanan lig ancak hydration sonrası uygulanıyordu →
 * birkaç saniye seçicide ve panelde "Süper Lig" görünüp kayıtlı lige geçiyordu. Çözüm (hubTabBoot.ts ile aynı kalıp):
 * hub'ın başında satır içi küçük betik, varsayılandan farklı bir kayıt varsa `<html data-hub-league-pending>` yazar →
 * CSS seçicideki lig adını / logosunu iskelete çevirir, panel içeriğini yeri korunarak gizler. Hatırlanan lig
 * uygulanınca (ya da kayıt geçersiz çıkınca) öznitelik kalkar. JS hiç çalışmazsa CSS 5 sn sonra yine gösterir.
 * Kayıt yoksa öznitelik yazılmaz: varsayılan lig hemen görünür.
 */
import { HUB_LEAGUE_STORAGE_KEY } from './hubLeaguePreference';

export const HUB_LEAGUE_PENDING_ATTR = 'data-hub-league-pending';

/** Kayıttaki lig id'si (biçim parseStoredHubLeague ile aynı: `{id, rows}` ya da düz sayı); geçersizse null. */
export function storedHubLeagueIdFromRaw(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    const id = typeof v === 'number' ? v : v && typeof v === 'object' ? (v as { id?: unknown }).id : null;
    return typeof id === 'number' && Number.isInteger(id) && id !== 0 ? id : null;
  } catch {
    return null;
  }
}

/** Satır içi betik — `storedHubLeagueIdFromRaw` ile aynı kural (bağımlılıksız, ES5). */
export function hubLeagueBootScript(defaultCompetitionId: number): string {
  return (
    "(function(){try{if(location.pathname!=='/')return;var r=localStorage.getItem('" +
    HUB_LEAGUE_STORAGE_KEY +
    "');if(!r)return;var v=JSON.parse(r);var id=typeof v==='number'?v:(v&&typeof v==='object'?v.id:null);" +
    "if(typeof id==='number'&&id%1===0&&id!==0&&id!==" +
    String(Math.trunc(defaultCompetitionId)) +
    ")document.documentElement.setAttribute('" +
    HUB_LEAGUE_PENDING_ATTR +
    "','')}catch(e){}})()"
  );
}

export function clearHubLeagueBoot(root: { removeAttribute(n: string): void }): void {
  root.removeAttribute(HUB_LEAGUE_PENDING_ATTR);
}
