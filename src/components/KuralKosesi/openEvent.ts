/** Kural Köşesi'ni sayfanın başka bir yerinden açmak için pencere olayı (Mount dinler; düğme yüklenmediyse yükler). */
export const KURAL_KOSESI_OPEN_EVENT = 'oy:kural-kosesi-open';

export function openKuralKosesi(): void {
  window.dispatchEvent(new Event(KURAL_KOSESI_OPEN_EVENT));
}
