/** AI Asistan'ı sayfanın herhangi bir yerinden açmak için pencere olayı (KuralKosesi/Mount dinler; balon yüklenmediyse yükler). */
export const ASSISTANT_OPEN_EVENT = 'oy:assistant-open';

export function openAssistant(): void {
  window.dispatchEvent(new Event(ASSISTANT_OPEN_EVENT));
}

/** Asistanın gizlendiği sayfalar (Kural Köşesi'nin gizlendikleri + ödeme akışı). */
export function isAssistantHidden(pathname: string): boolean {
  return /^\/(auth|admin|odeme)(\/|$)/.test(pathname);
}
