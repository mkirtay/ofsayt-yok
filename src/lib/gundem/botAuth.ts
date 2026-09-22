import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';

/** `Authorization: Bearer $CRON_SECRET` (cron/CI/elle tetikleme) — `CRON_SECRET` tanımsızsa her zaman false. */
export function isValidCronRequest(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

/** Bot uçları: CRON_SECRET ya da ADMIN oturumu (handler seviyesinde zorunlu kontrol). Reddedilirse yanıt yazılmıştır → false. */
export async function requireCronOrAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  if (isValidCronRequest(req)) return true;
  const guard = await requireAdmin(req, res);
  return guard.ok;
}
