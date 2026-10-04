import type { NextApiRequest, NextApiResponse } from 'next';
import { getRequestAuth } from '@/lib/mobileAuth';
import { prisma } from '@/lib/prisma';
import { loadAiStatsDashboard, type AiStatsDashboard } from '@/lib/loadAiStatsDashboard';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AiStatsDashboard | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getRequestAuth(req, res);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Rol oturumdan / belirteçten değil DB'den: yetkisi alınan yönetici kilitli tahminleri görmeye devam etmesin.
    const row = await prisma.user.findUnique({ where: { id: auth.id }, select: { role: true } });
    if (!row) return res.status(401).json({ error: 'Unauthorized' });
    const data = await loadAiStatsDashboard({ role: row.role });
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).json(data);
  } catch (e) {
    console.error('GET /api/ai-stats/dashboard', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
