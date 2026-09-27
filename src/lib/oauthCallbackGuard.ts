/**
 * NextAuth v4, OAuth callback'inde geçerli bir oturum çerezi görürse yeni hesabı OTURUMDAKİ kullanıcıya bağlar
 * (callback-handler "user varsa linkAccount" dalı) — `allowDangerousEmailAccountLinking`'den bağımsız bir otomatik
 * bağlama yolu. Hesap bağlamayı desteklemiyoruz: OAuth callback isteğinden oturum çerezini çıkarırız; giriş her zaman
 * Google hesabının kendisine göre (mevcut bağ / yeni kullanıcı / OAuthAccountNotLinked) çözülür ve yeni oturum eskisini ezer.
 */
const SESSION_COOKIE_PREFIXES = ['next-auth.session-token', '__Secure-next-auth.session-token'];

/** `/api/auth/callback/<provider>` isteği mi? (credentials hariç — onun oturum çerezine ihtiyacı yok ama dokunmayız) */
export function isOAuthCallback(nextauth: unknown): boolean {
  const parts = Array.isArray(nextauth) ? nextauth : [];
  return parts[0] === 'callback' && typeof parts[1] === 'string' && parts[1] !== 'credentials';
}

/** Oturum çerezlerini (parçalı `.0`, `.1` dahil) düşürülmüş kopya. */
export function withoutSessionCookies(cookies: Partial<Record<string, string>>): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(cookies).filter(([name]) => !SESSION_COOKIE_PREFIXES.some((p) => name.startsWith(p))),
  );
}
