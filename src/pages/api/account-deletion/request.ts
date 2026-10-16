import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { checkTurnstileGate, emailLocale, sha256 } from '@/lib/security';
import { canonicalEmail } from '@/lib/emailNormalize';
import { captureWarning } from '@/lib/logger';
import { runInBackground } from '@/server/backgroundTask';
import { isPlausibleEmail, requestAccountDeletion } from '@/server/account/deletionRequest';

// Gövde: e-posta + Turnstile belirteci + dil; Next varsayılanı 1 MB yerine 16 KB — aşılırsa 413.
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

// IP başına 15 dakikada 5 (Redis yoksa reddet: kimlik uçlarıyla aynı). E-posta başına saatte 3 bağlantı — aşılırsa
// yanıt yine aynı, yalnız e-posta gönderilmez (anahtar e-postanın özeti; adres Redis'e yazılmaz).
const IP_LIMIT = 5;
const IP_WINDOW_MS = 15 * 60_000;
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_MS = 60 * 60_000;

/** Her durumda aynı gövde (hesap var / yok / korunuyor / e-posta sınırı aşıldı). */
export const DELETION_REQUEST_ACCEPTED = { ok: true } as const;

/**
 * POST /api/account-deletion/request `{ email, turnstileToken, locale }` — giriş yapmadan hesap silme talebi
 * (/hesap-silme). Hesap var mı yok mu yanıttan ve süreden anlaşılmaz: arama ve e-posta yanıt gönderildikten SONRA arka
 * planda (`runInBackground`) yapılır; yanıt süresi yalnız hız sınırı ve Turnstile kontrolüne bağlıdır.
 * 200 her zaman `{ ok: true }` · 400 biçim / Turnstile · 429 IP sınırı · 503 Turnstile anahtarı yok.
 * Ayrıntı: server/account/deletionRequest.ts. E-posta adresi loglanmaz, Sentry'ye gitmez.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers, req.socket?.remoteAddress);
  const ipLimit = await hitFixedWindowRateLimit(`account-delete-request:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS, { failClosed: true });
  if (!ipLimit.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((ipLimit.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.', code: 'RATE_LIMITED' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const turnstile = await checkTurnstileGate(body.turnstileToken, ip, {
    unavailableError: 'Talep şu anda alınamıyor. Lütfen daha sonra tekrar deneyin.',
  });
  if (!turnstile.ok) return res.status(turnstile.status).json({ error: turnstile.error, code: 'TURNSTILE_FAILED' });

  const email = body.email;
  if (!isPlausibleEmail(email)) {
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.', code: 'INVALID_EMAIL' });
  }
  const locale = emailLocale(body.locale);

  // E-posta sınırı da her istekte sayılır (hesap olsun olmasın) → süre farkı yok.
  const emailKey = sha256(canonicalEmail(email.trim()));
  const emailLimit = await hitFixedWindowRateLimit(`account-delete-request:email:${emailKey}`, EMAIL_LIMIT, EMAIL_WINDOW_MS, {
    memoryFallback: true,
  });
  if (emailLimit.success) {
    runInBackground(async () => {
      try {
        await requestAccountDeletion(email, locale);
      } catch (e) {
        // Ham hata yazılmaz (Prisma iletisi sorgu değerini — e-postayı — içerebilir): yalnız kod / tür.
        const code = (e as { code?: unknown } | null)?.code;
        captureWarning('account-delete-request', 'Hesap silme talebi işlenemedi', {
          code: typeof code === 'string' ? code : null,
          name: e instanceof Error ? e.name : typeof e,
        });
      }
    });
  }

  return res.status(200).json(DELETION_REQUEST_ACCEPTED);
}
