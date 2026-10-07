const CHECK_ORIGIN = 'https://site.invalid';

/**
 * Giriş sonrası dönüş adresi: yalnızca site içi göreli yol kabul edilir (open redirect yok); geçersizse `fallback`.
 * - `/` ile başlamalı; kontrol karakteri (tab, satır sonu…) ve `\` içeremez — tarayıcılar bunları atar ya da `/`
 *   sayar (`/\t/evil.com` → `//evil.com`).
 * - Sabit bir kökene göre çözülünce köken değişmemeli (`//evil.com`, `/\\evil.com` vb. her biçim yakalanır).
 */
export function safeCallbackPath(raw: unknown, fallback = '/'): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !v.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  try {
    if (new URL(v, CHECK_ORIGIN).origin !== CHECK_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return v;
}

/**
 * Oturum açıkken giriş / kayıt sayfası açılırsa gidilecek yer: geçerli `callbackUrl`, yoksa ana sayfa. Hedef yine
 * giriş / kayıt sayfasıysa (dil önekiyle de) ana sayfa — yönlendirme döngüsü olmasın.
 */
export function signedInRedirectPath(raw: unknown): string {
  const path = safeCallbackPath(raw);
  return /^(?:\/[a-z]{2})?\/auth\/(?:signin|signup)(?:[/?#]|$)/.test(path) ? '/' : path;
}
