import type { NextApiRequest, NextApiResponse } from 'next';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { consumePasswordResetToken } from '@/lib/security';
import { validatePassword } from '@/lib/validation';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';

const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress);
  const limitState = await hitFixedWindowRateLimit(`reset-pw:${ip}`, LIMIT, WINDOW_MS);
  if (!limitState.success) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((limitState.resetAt - Date.now()) / 1000)).toString());
    return res.status(429).json({ error: 'Cok fazla deneme. Lutfen daha sonra tekrar deneyin.' });
  }

  const { token, password } = req.body ?? {};

  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Gecersiz veya eksik token.' });
  }

  if (typeof password !== 'string' || !validatePassword(password).valid) {
    return res.status(400).json({
      error: 'Sifre en az 10 karakter olmali, buyuk harf, kucuk harf, rakam ve ozel karakter icermelidir.',
    });
  }

  const email = await consumePasswordResetToken(token);
  if (!email) {
    return res.status(400).json({ error: 'Sifirlama baglantisi gecersiz veya suresi dolmus.' });
  }

  const hashed = await hash(password, 12);
  await prisma.user.update({
    where: { email },
    data: { password: hashed },
  });

  return res.status(200).json({ ok: true, email });
}
