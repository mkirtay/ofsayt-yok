import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { optionalString, readJsonBody } from '@/lib/gundem/validation';

const PLATFORMS = ['ios', 'android', 'web'];
const MAX_TOKEN_LENGTH = 1024;

/**
 * POST: cihaz push token'ını kaydeder/yeniler (token benzersiz; başka kullanıcıdaysa bu kullanıcıya devredilir).
 * DELETE: token'ı siler (çıkış yaparken). Yalnızca KAYIT — gönderim altyapısı Faz B.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).end();
  }

  try {
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    const { userId } = guard;

    const rl = await hitFixedWindowRateLimit(`push-register:user:${userId}`, 10, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Çok fazla istek. Biraz bekleyin.' });
    }

    const input = readJsonBody(req);
    const token = optionalString(input.token, MAX_TOKEN_LENGTH);
    if (!token) return res.status(400).json({ error: 'Geçersiz token.' });

    if (req.method === 'DELETE') {
      await prisma.pushToken.deleteMany({ where: { token, userId } });
      return res.status(204).end();
    }

    const platform = typeof input.platform === 'string' ? input.platform : '';
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Geçersiz platform (ios, android veya web).' });
    }

    const now = new Date();
    await prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: now, disabledAt: null },
    });
    return res.status(204).end();
  } catch (e) {
    captureError('push:register', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
