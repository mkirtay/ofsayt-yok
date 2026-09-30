/**
 * POST /api/admin/sentry-test — sunucu tarafı Sentry'nin çalıştığını doğrulamak için tek bir `info`
 * olayı gönderir ve gönderimi bekler (serverless'ta fonksiyon bitmeden). CRON_SECRET ya da ADMIN oturumu.
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
  const eventId = Sentry.withScope((scope) => {
    scope.setTag('sentry_test', 'server');
    scope.setLevel('info');
    return Sentry.captureMessage(`Sentry sunucu test olayı (${new Date().toISOString()})`);
  });
  const flushed = await Sentry.flush(5_000);
  return res.status(200).json({ initialized: Boolean(client), eventId, flushed });
}
