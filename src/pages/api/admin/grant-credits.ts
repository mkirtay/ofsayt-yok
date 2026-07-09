/**
 * POST /api/admin/grant-credits
 * Admin-only. Email veya userId ile bir kullanıcıya kredi tanımlar (pozitif/negatif).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAuth';
import { addCredits } from '@/lib/credits';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;

  const { email, userId, amount, note } = req.body ?? {};
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
    return res.status(400).json({ error: 'amount sayısal ve sıfırdan farklı olmalı.' });
  }
  if (!email && !userId) {
    return res.status(400).json({ error: 'email veya userId gerekli.' });
  }

  const user = await prisma.user.findUnique({
    where: userId ? { id: String(userId) } : { email: String(email).toLowerCase() },
    select: { id: true, email: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  const balanceAfter = await addCredits(
    user.id,
    parsedAmount,
    'ADMIN_GRANT',
    typeof note === 'string' ? note : undefined
  );

  return res.status(200).json({ ok: true, email: user.email, credits: balanceAfter });
}
