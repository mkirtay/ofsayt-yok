import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { emailLocale } from '@/lib/security';
import { captureWarning } from '@/lib/logger';
import { checkAccountDeletionToken, confirmAccountDeletion } from '@/server/account/deletionRequest';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

// IP başına 15 dakikada 20 (kontrol + onay birlikte; belirteç 256 bit, tahmin edilemez — sınır yalnız gürültüye karşı).
const IP_LIMIT = 20;
const IP_WINDOW_MS = 15 * 60_000;

/**
 * POST /api/account-deletion/confirm — e-postadaki bağlantının açtığı onay sayfası (/hesap-silme/onay).
 * - `{ token, check: true }` → 200 `{ valid }`; hiçbir şey silinmez, belirteç tüketilmez (sayfa açılınca).
 * - `{ token, locale }` → belirteci tüketir ve hesabı siler: 200 `{ ok: true, deleted: true, emailSent }` · 410 `INVALID_TOKEN`
 *   (geçersiz / süresi dolmuş / kullanılmış) · 403 `PROTECTED_ACCOUNT`.
 * GET ve diğer yöntemler 405: e-posta önizleyicileri / güvenlik tarayıcıları bağlantıyı açsa da silme tetiklenmez.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`account-delete-confirm:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS, { failClosed: true });
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.', code: 'RATE_LIMITED' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  try {
    if (body.check === true) {
      return res.status(200).json({ valid: await checkAccountDeletionToken(body.token) });
    }
    const result = await confirmAccountDeletion(body.token, emailLocale(body.locale));
    if (result.ok) return res.status(200).json({ ok: true, deleted: true, emailSent: result.emailSent });
    if (result.reason === 'PROTECTED_ACCOUNT') {
      return res.status(403).json({ error: 'Bu hesap buradan silinemez. Destek ile iletişime geçin.', code: 'PROTECTED_ACCOUNT' });
    }
    return res.status(410).json({ error: 'Bağlantı geçersiz, süresi dolmuş ya da kullanılmış.', code: 'INVALID_TOKEN' });
  } catch (e) {
    // Ham hata Sentry'ye gönderilmez: yalnız Prisma kodu / hata türü.
    const code = (e as { code?: unknown } | null)?.code;
    captureWarning('account-delete-confirm', 'Hesap silme onayı başarısız', {
      code: typeof code === 'string' ? code : null,
      name: e instanceof Error ? e.name : typeof e,
    });
    return res.status(500).json({ error: 'Hesap silinemedi. Lütfen biraz sonra tekrar deneyin.' });
  }
}
