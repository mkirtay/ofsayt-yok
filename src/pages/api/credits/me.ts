import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/mobileAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getRequestUserId(req, res);
  if (!userId) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user) {
    return res.status(401).json({ error: 'Oturum geçersiz.' });
  }

  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return res.status(200).json({ credits: user.credits });
}
