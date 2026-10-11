/** Tahmin oyunu uçlarının ortak yardımcıları: IP / kullanıcı hız sınırı (Upstash; fail-open) ve sorgu okuma. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';

export const READ_IP_LIMIT = 120;
export const WRITE_USER_LIMIT = 20;
export const WRITE_IP_LIMIT = 60;
const WINDOW_MS = 60_000;

export function queryString(req: NextApiRequest, key: string): string | null {
  const v = req.query[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.length <= 64 ? s : null;
}

function ipOf(req: NextApiRequest): string {
  return requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
}

/** false → 429 yazıldı. */
export async function limitRead(req: NextApiRequest, res: NextApiResponse, bucket: string): Promise<boolean> {
  const rl = await hitFixedWindowRateLimit(`game-${bucket}:ip:${ipOf(req)}`, READ_IP_LIMIT, WINDOW_MS);
  if (rl.success) return true;
  res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
  res.status(429).json({ error: 'Çok fazla istek gönderdiniz. Biraz bekleyin.' });
  return false;
}

export async function limitWrite(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<boolean> {
  const [byUser, byIp] = await Promise.all([
    hitFixedWindowRateLimit(`game-save:user:${userId}`, WRITE_USER_LIMIT, WINDOW_MS),
    hitFixedWindowRateLimit(`game-save:ip:${ipOf(req)}`, WRITE_IP_LIMIT, WINDOW_MS),
  ]);
  if (byUser.success && byIp.success) return true;
  res.setHeader('Retry-After', String(Math.ceil((Math.max(byUser.resetAt, byIp.resetAt) - Date.now()) / 1000)));
  res.status(429).json({ error: 'Çok fazla istek gönderdiniz. Biraz bekleyin.' });
  return false;
}

export function methodNotAllowed(res: NextApiResponse, allow: string) {
  res.setHeader('Allow', allow);
  return res.status(405).json({ error: 'Method not allowed' });
}
