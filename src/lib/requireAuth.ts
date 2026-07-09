/**
 * Auth-gated API route helper'ları.
 *
 * Kullanım:
 * ```ts
 * const guard = await requireAuth(req, res);
 * if (!guard.ok) return; // response zaten yazıldı
 * const { userId } = guard;
 * ```
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/mobileAuth';

type AuthGuardResult = { ok: true; userId: string } | { ok: false };

export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthGuardResult> {
  const userId = await getRequestUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    return { ok: false };
  }
  return { ok: true, userId };
}

export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthGuardResult> {
  const userId = await getRequestUserId(req, res);
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
