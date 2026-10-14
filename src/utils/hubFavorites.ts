/**
 * Ana sayfa favorileri (yalnız bu cihaz, `localStorage` — hesapla senkron değil; üye profilden içeri aktarır, bkz.
 * Profile/FavoritesTab). Yıldız aç/kapa kuralı ve "Favoriler (n)" sayacı.
 *
 * Sayaç ISR HTML'inde bilinmez: hub'ın başındaki satır içi betik boyamadan önce sayıyı `<html>` üzerindeki CSS
 * değişkenine yazar, sekme/çip `::after { content: var(--hub-fav-count, none) }` ile gösterir → hydration sonrası
 * genişlik zıplaması (kayma) yok. React yıldıza basılınca aynı değişkeni günceller.
 */
import { HOME_FAVORITES_LS_KEY } from './favoriteImport';

export const HUB_FAV_COUNT_VAR = '--hub-fav-count';

/** CSS `content` değeri: 0 → null (değişken kaldırılır, `::after` hiç çizilmez). */
export function favCountCssValue(count: number): string | null {
  return count > 0 ? `"(${count})"` : null;
}

export function applyFavCount(count: number, style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>): void {
  const v = favCountCssValue(count);
  if (v) style.setProperty(HUB_FAV_COUNT_VAR, v);
  else style.removeProperty(HUB_FAV_COUNT_VAR);
}

/** Satır içi betik — `parseLocalFavoriteIds(...).length` + `applyFavCount` ile aynı kural (bağımlılıksız, ES5). */
export const HUB_FAV_COUNT_BOOT_SCRIPT =
  "(function(){try{var a=JSON.parse(localStorage.getItem('" +
  HOME_FAVORITES_LS_KEY +
  "')||'[]'),s={},n=0,i,v;if(Object.prototype.toString.call(a)!=='[object Array]')return;for(i=0;i<a.length;i++){v=Number(a[i]);if(v>0&&v%1===0&&!s[v]){s[v]=1;n++}}if(n>0)document.documentElement.style.setProperty('" +
  HUB_FAV_COUNT_VAR +
  "','\"('+n+')\"')}catch(e){}})()";

export type FavoriteToggle = { next: number[]; change: 'added' | 'removed' | null };

/**
 * Maç satırı yıldızı: maçın iki takımından biri favoriyse yıldız dolu görünür → basınca ikisi de çıkar ("removed");
 * değilse ev sahibi eklenir ("added"). Eskiden hep ev sahibi değiştiriliyordu: yalnız deplasman favoriyken dolu
 * yıldıza basmak ev sahibini EKLİYORDU (yıldız dolu kalıyordu).
 */
export function toggleMatchFavorite(ids: readonly number[], homeId: number, awayId: number): FavoriteToggle {
  const isFav = (id: number) => id > 0 && ids.includes(id);
  if (isFav(homeId) || isFav(awayId)) {
    return { next: ids.filter((id) => id !== homeId && id !== awayId), change: 'removed' };
  }
  if (homeId > 0) return { next: [...ids, homeId], change: 'added' };
  return { next: [...ids], change: null };
}
