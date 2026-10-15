import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { queryString } from '@/lib/gundem/validation';
import { blockUser, unblockUser } from '@/lib/gundem/blocks';

/**
 * POST: kullanıcıyı engelle · DELETE: engeli kaldır (ikisi de idempotent). Yanıt `{ blocked }`. Web oturumu ya da mobil
 * Bearer. Engelleme iki yöndeki takibi de kaldırır. Kendini 400 `CANNOT_BLOCK_SELF`, resmi hesap 400 `CANNOT_BLOCK`,
 * yok / silinmiş kullanıcı 404, hız sınırı 429. Kullanım Şartları onay kapısı uygulanmaz (güvenlik işlevi).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetId = queryString(req.query.userId);
  if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).end();
  }
  try {
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    const rl = await hitFixedWindowRateLimit(`gundem-block:user:${guard.userId}`, 30, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Çok fazla işlem yaptınız. Biraz bekleyin.' });
    }
    const result = req.method === 'POST' ? await blockUser(guard.userId, targetId) : await unblockUser(guard.userId, targetId);
    if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
    return res.json({ blocked: result.blocked });
  } catch (e) {
    captureError('gundem:block', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
