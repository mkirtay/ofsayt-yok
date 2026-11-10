/** `/api/combo/*` kapısı: bayrak kapalı → 404; oturum yok → 401; ADMIN / izin listesinde değil → 404 (varlık gizlenir). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { comboToolEnabled, viewerCanUseComboTool } from '@/config/comboTool';
import { getRequestUserId } from '@/lib/mobileAuth';
import { prisma } from '@/lib/prisma';

export async function requireComboAccess(req: NextApiRequest, res: NextApiResponse): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (!comboToolEnabled()) {
    res.status(404).json({ error: 'Not found' });
    return { ok: false };
  }
  const userId = await getRequestUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    return { ok: false };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  if (!viewerCanUseComboTool({ id: userId, role: user?.role, email: user?.email })) {
    res.status(404).json({ error: 'Not found' });
    return { ok: false };
  }
  return { ok: true, userId };
}
