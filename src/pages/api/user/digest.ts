/** Haftalık e-posta özeti izni (büyüme raporu 3.3) — GET: durum; POST { optIn: boolean }. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { readJsonBody } from '@/lib/gundem/validation';
import { digestOptedIn, setDigestOptIn } from '@/lib/weeklyDigest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'POST') {
      const body = readJsonBody(req) as { optIn?: unknown };
      if (typeof body.optIn !== 'boolean') return res.status(400).json({ error: 'Geçersiz istek.' });
      await setDigestOptIn(guard.userId, body.optIn);
    }
    return res.status(200).json({ optIn: await digestOptedIn(guard.userId) });
  } catch (e) {
    captureError('user-digest', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
