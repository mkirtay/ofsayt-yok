/** GET /api/admin/gundem/drafts?status=PENDING|APPROVED|REJECTED|POSTED|STALE|all&cursor= — onay kuyruğu listesi (ADMIN). */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { BotDraftStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { requireAdmin } from '@/lib/requireAuth';
import { PAGE_SIZE, queryString } from '@/lib/gundem/validation';
import { paginate } from '@/lib/gundem/posts';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'POSTED', 'STALE'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;

    const statusRaw = queryString(req.query.status) ?? 'PENDING';
    if (statusRaw !== 'all' && !(STATUSES as readonly string[]).includes(statusRaw)) {
      return res.status(400).json({ error: 'Geçersiz durum.' });
    }
    const cursor = queryString(req.query.cursor);
    const rows = await prisma.gundemBotDraft.findMany({
      where: statusRaw === 'all' ? {} : { status: statusRaw as BotDraftStatus },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return res.json(paginate(rows, PAGE_SIZE));
  } catch (e) {
    captureError('gundem:drafts-list', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
