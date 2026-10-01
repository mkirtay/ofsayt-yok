/** Kural Köşesi düğmesinin hiç gösterilmediği sayfalar: giriş/kayıt akışı ve admin. */
export function isKuralKosesiHidden(pathname: string): boolean {
  return /^\/(auth|admin)(\/|$)/.test(pathname);
}
