import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { createAndSendPasswordReset } from '@/lib/security';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';

const LIMIT = 3;
const WINDOW_MS = 15 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress);
  const limitState = await hitFixedWindowRateLimit(`forgot-pw:${ip}`, LIMIT, WINDOW_MS);
  if (!limitState.success) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((limitState.resetAt - Date.now()) / 1000)).toString());
    return res.status(429).json({ error: 'Cok fazla deneme. Lutfen daha sonra tekrar deneyin.' });
  }

  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Gecersiz e-posta adresi.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Kullanıcı var mı yok mu dışarıya sızdırmıyoruz
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (user) {
    try {
      await createAndSendPasswordReset(normalizedEmail);
    } catch (e) {
      console.error('[forgot-password]', e);
    }
  }

  return res.status(200).json({ ok: true });
}
