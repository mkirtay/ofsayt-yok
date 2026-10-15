import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { readJsonBody } from '@/lib/gundem/validation';
import { REPORT_RATE_LIMIT, REPORT_RATE_WINDOW_MS } from '@/config/moderation';
import { createReport, parseReportInput } from '@/lib/moderation/reports';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

/**
 * POST: şikâyet — gövde `{ targetType: 'POST' | 'COMMENT' | 'USER', targetId, reason, note? }` (docs/WEB_CHANGES_FOR_MOBILE
 * §24). Giriş zorunlu (web oturumu ya da mobil Bearer); Kullanım Şartları onay kapısı UYGULANMAZ (şikâyet engellenmesin).
 * 201 `{ ok, reportId }` · aynı hedefi yeniden: 200 `{ ok, duplicate: true }` · 400 (geçersiz gövde / `CANNOT_REPORT_SELF`)
 * · 404 `NOT_FOUND` · 429 + Retry-After. Şikâyet edenin kimliği içerik sahibine hiçbir yanıtta gösterilmez.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    const rl = await hitFixedWindowRateLimit(`gundem-report:user:${guard.userId}`, REPORT_RATE_LIMIT, REPORT_RATE_WINDOW_MS, {
      memoryFallback: true,
    });
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Çok fazla şikâyet gönderdin. Biraz sonra tekrar dene.', code: 'RATE_LIMITED' });
    }
    const parsed = parseReportInput(readJsonBody(req) as Parameters<typeof parseReportInput>[0]);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error, code: 'INVALID_REPORT' });
    const result = await createReport(guard.userId, parsed);
    if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
    if (result.duplicate) return res.status(200).json({ ok: true, duplicate: true });
    return res.status(201).json({ ok: true, reportId: result.reportId });
  } catch (e) {
    captureError('gundem:reports', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
