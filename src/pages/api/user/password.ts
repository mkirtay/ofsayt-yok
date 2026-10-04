import type { NextApiRequest, NextApiResponse } from 'next';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { getRequestUserId, hasBearerToken, issueMobileToken } from '@/lib/mobileAuth';
import { validatePassword } from '@/lib/validation';
import { invalidateSessionVersion } from '@/lib/sessionVersion';

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

  const rl = await hitFixedWindowRateLimit(`password:${userId}`, 3, 30 * 60 * 1000, { failClosed: true });
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

  // Kayıt / sıfırlama ile aynı kural (önceden burada 6 karakter yetiyordu).
  if (!validatePassword(newPassword).valid) {
    return res.status(400).json({
      error: 'Yeni şifre en az 10 karakter olmalı; büyük harf, küçük harf, rakam ve özel karakter içermelidir.',
    });
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
    // tokenVersion artar → bu kullanıcının TÜM açık oturumları ve mobil belirteçleri geçersiz (bu istemci dahil).
    // Mobil istemciye yeni belirteç dönülür; web istemcisi yeni şifreyle yeniden giriş yapar (InfoTab).
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, tokenVersion: { increment: 1 } },
      select: { id: true, role: true, credits: true, email: true, name: true, username: true, tokenVersion: true },
    });
    await invalidateSessionVersion(userId); // önbellekteki eski sürüm hemen düşsün

    if (hasBearerToken(req)) {
      const token = await issueMobileToken({
        sub: updated.id,
        role: updated.role,
        credits: updated.credits,
        email: updated.email,
        name: updated.name,
        username: updated.username,
        tokenVersion: updated.tokenVersion,
      });
      return res.status(200).json({ ok: true, sessionsRevoked: true, token });
    }
    return res.status(200).json({ ok: true, sessionsRevoked: true });
  } catch (e) {
    console.error('[user/password]', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
