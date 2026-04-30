/**
 * Premium-gated API route helper.
 *
 * Kullanım:
 * ```ts
 * const guard = await requirePremium(req, res);
 * if (!guard.ok) return; // response zaten yazıldı
 * const { userId } = guard;
 * ```
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { isUserPremium } from '@/lib/premium';

type PremiumGuardResult =
  | { ok: true; userId: string }
  | { ok: false };

export async function requirePremium(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PremiumGuardResult> {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    return { ok: false };
  }

  // JWT throttle nedeniyle session bayatlamış olabilir → DB'den doğrula
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, premiumUntil: true },
  });
  if (!user) {
    res.status(401).json({ error: 'Oturum geçersiz.' });
    return { ok: false };
  }
  if (!isUserPremium(user)) {
    res.status(403).json({
      error: 'Bu özellik premium üyelere özeldir.',
      code: 'PREMIUM_REQUIRED',
    });
    return { ok: false };
  }
  return { ok: true, userId };
}

export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PremiumGuardResult> {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    return { ok: false };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    return { ok: false };
  }
  return { ok: true, userId };
}
