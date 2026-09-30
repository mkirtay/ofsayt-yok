/**
 * POST /api/admin/sentry-test — sunucu tarafı Sentry'nin GERÇEKTEN olay gönderebildiğini doğrular.
 * Başarı yalnızca: istemci başlatılmış + DSN tanımlı + olay kuyruğu boşaltılmış. Aksi halde açık hata
 * (DSN boşken SDK sessizce hiçbir şey göndermez; `flush` yine `true` döner — yanıltıcı başarı olmasın).
 * CRON_SECRET ya da ADMIN oturumu.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import * as Sentry from '@sentry/nextjs';
import { requireCronOrAdmin } from '@/lib/gundem/botAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireCronOrAdmin(req, res))) return;

  const client = Sentry.getClient();
  const dsn = client?.getDsn();
  const status = { initialized: Boolean(client), hasDsn: Boolean(dsn), projectId: dsn?.projectId ?? null, host: dsn?.host ?? null };
  if (!client || !dsn) {
    return res.status(503).json({ ok: false, error: 'Sentry sunucuda yapılandırılmamış (istemci ya da DSN yok) — olay gönderilmedi.', ...status });
  }

  const eventId = Sentry.withScope((scope) => {
    scope.setTag('sentry_test', 'server');
    scope.setLevel('info');
    return Sentry.captureMessage(`Sentry sunucu test olayı (${new Date().toISOString()})`);
  });
  const flushed = await Sentry.flush(5_000);
  if (!flushed) {
    return res.status(502).json({ ok: false, error: 'Olay 5 sn içinde gönderilemedi (flush zaman aşımı).', eventId, ...status });
  }
  return res.status(200).json({ ok: true, eventId, flushed, ...status });
}
