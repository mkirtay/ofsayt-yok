import { hitFixedWindowRateLimit } from './rateLimit';

/** Aynı IP + aynı hesap (e-posta / kullanıcı adı): 15 dk'da 10 deneme (mobil girişin IP sınırıyla aynı sayı). */
export const LOGIN_PER_ACCOUNT_LIMIT = 10;
/** Aynı IP'den farklı hesaplara (parola püskürtme): 15 dk'da 30 deneme. */
export const LOGIN_PER_IP_LIMIT = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Web şifreli giriş (NextAuth credentials) deneme sınırı. Hesap anahtarı küçük harfe indirilir (`Ali@x.com` ile
 * `ali@x.com` aynı sayaç). Redis hatasında reddeder (fail-closed). Mobil giriş kendi IP sınırını kullanır.
 */
export async function hitLoginRateLimit(
  ip: string,
  identifier: string,
): Promise<{ success: boolean; resetAt: number }> {
  const id = identifier.trim().toLowerCase().slice(0, 200);
  const perIp = await hitFixedWindowRateLimit(`login:ip:${ip}`, LOGIN_PER_IP_LIMIT, LOGIN_WINDOW_MS, {
    failClosed: true,
  });
  if (!perIp.success) return perIp;
  return hitFixedWindowRateLimit(`login:acct:${ip}:${id}`, LOGIN_PER_ACCOUNT_LIMIT, LOGIN_WINDOW_MS, {
    failClosed: true,
  });
}

/** `POST /api/auth/callback/credentials` — NextAuth şifreli giriş denemesi. */
export function isCredentialsCallback(method: string | undefined, nextauth: unknown): boolean {
  const parts = Array.isArray(nextauth) ? nextauth : [];
  return method === 'POST' && parts[0] === 'callback' && parts[1] === 'credentials';
}
