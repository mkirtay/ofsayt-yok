import type { NextApiRequest, NextApiResponse } from 'next';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { getRequestUserId } from '@/lib/mobileAuth';

function parseJsonBody(req: NextApiRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof b === 'object') return b as Record<string, unknown>;
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const userId = await getRequestUserId(req, res);
  if (!userId) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  const rl = await hitFixedWindowRateLimit(`password:${userId}`, 3, 30 * 60 * 1000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla şifre değiştirme isteği. Lütfen bekleyin.' });
  }

  const body = parseJsonBody(req);
  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre gerekli.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user?.password) {
      return res.status(400).json({ error: 'Bu hesap için şifre değiştirilemez.' });
    }

    const ok = await compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ error: 'Mevcut şifre yanlış.' });
    }

    const hashed = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[user/password]', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
