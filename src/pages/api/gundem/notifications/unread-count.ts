import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { notificationVisibilityWhere } from '@/lib/gundem/visibility';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    const count = await prisma.notification.count({ where: { userId: guard.userId, readAt: null, ...notificationVisibilityWhere(guard.userId) } });
    return res.json({ count });
  } catch (e) {
    captureError('gundem:unread-count', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
