import { safeCallbackPath } from '@/lib/authRedirect';

/** Asistanın yönlendirebildiği tek dönüş adresi biçimi: maç sayfasının AI Analiz sekmesi. */
const MATCH_AI_TAB = /^\/matches\/\d+(?:-[a-z0-9-]+)?\?sekme=ai-analiz$/;

/**
 * "Giriş yap" bağlantısı: giriş sonrası maç sayfasının AI Analiz sekmesine döner. Dönüş adresi beyaz listeden
 * (yalnız `/matches/<id>-<slug>?sekme=ai-analiz`, site içi); uymuyorsa dönüş adresi verilmez.
 */
export function assistantSignInHref(matchHref: string): string {
  const path = safeCallbackPath(matchHref, '');
  return MATCH_AI_TAB.test(path) ? `/auth/signin?callbackUrl=${encodeURIComponent(path)}` : '/auth/signin';
}
