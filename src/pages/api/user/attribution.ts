/**
 * POST /api/user/attribution — kayıt kaynağını (ilk temas) hesaba yazar; Google ile kayıtta kullanılır
 * (hesabı NextAuth oluşturduğu için kayıt isteğinde gövde yok). Yalnızca oturum sahibinin, son 24 saatte
 * açılmış ve kaynağı henüz yazılmamış hesabına bir kez yazar; aksi halde no-op (eski hesaplar etkilenmez).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { parseSignupAttribution } from '@/utils/signupAttribution';

const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;

  const fields = parseSignupAttribution(req.body);
  if (!fields) return res.status(400).json({ error: 'Geçersiz kaynak bilgisi' });

  const { count } = await prisma.user.updateMany({
    where: { id: guard.userId, firstTouchAt: null, createdAt: { gte: new Date(Date.now() - NEW_ACCOUNT_WINDOW_MS) } },
    data: fields,
  });
  return res.status(200).json({ updated: count > 0 });
}
