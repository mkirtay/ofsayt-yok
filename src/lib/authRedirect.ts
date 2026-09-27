/**
 * Giriş sonrası dönüş adresi: yalnızca site içi göreli yol kabul edilir (`/` ile başlar, `//` ve `/\` değil).
 * Dış adreslere yönlendirmeyi (open redirect) engeller; geçersizse `fallback`.
 */
export function safeCallbackPath(raw: unknown, fallback = '/'): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return fallback;
  return v;
}
