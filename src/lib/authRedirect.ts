/**
 * Giriş sonrası dönüş adresi: yalnızca site içi göreli yol kabul edilir (`/` ile başlar, `//` ve `/\` değil).
 * Dış adreslere yönlendirmeyi (open redirect) engeller; geçersizse `fallback`.
 */
export function safeCallbackPath(raw: unknown, fallback = '/'): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return fallback;
  return v;
}

/** Google girişi sonrası önce kullanıcı adı adımı (adı olan kullanıcıyı sayfa hemen `target`'a geçirir). */
export function googleCallbackUrl(target: string): string {
  return `/auth/choose-username?callbackUrl=${encodeURIComponent(safeCallbackPath(target))}`;
}
