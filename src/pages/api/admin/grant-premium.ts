/**
 * Admin tarafından bir kullanıcıya premium üyelik atar.
 *
 * POST body:
 *   { email: string, days: number }       → email'e göre kullanıcı bul, X gün premium ver
 *   { userId: string, days: number }      → id'ye göre
 *   { email|userId, premiumUntil: string }→ ISO tarihi direkt set et (test için)
 *   { email|userId, days: 0 }             → premium'u iptal et (premiumUntil = null)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requirePremium';

function parseJsonBody(req: NextApiRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof b === 'object') return b as Record<string, unknown>;
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;

  const body = parseJsonBody(req);
  const email = typeof body.email === 'string' ? body.email.trim() : null;
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null;
  const daysRaw = body.days;
  const premiumUntilRaw = body.premiumUntil;

  if (!email && !userId) {
    return res.status(400).json({ error: 'email veya userId gereklidir.' });
  }

  let premiumUntil: Date | null = null;
  if (typeof premiumUntilRaw === 'string' && premiumUntilRaw.trim()) {
    const d = new Date(premiumUntilRaw);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Geçersiz premiumUntil.' });
    }
    premiumUntil = d;
  } else if (typeof daysRaw === 'number' && Number.isFinite(daysRaw)) {
    if (daysRaw <= 0) {
      premiumUntil = null;
    } else {
      premiumUntil = new Date(Date.now() + daysRaw * 24 * 60 * 60 * 1000);
    }
  } else {
    return res.status(400).json({ error: 'days (number) veya premiumUntil (ISO) gereklidir.' });
  }

  try {
    const where = userId ? { id: userId } : { email: email! };
    const user = await prisma.user.update({
      where,
      data: { premiumUntil },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        premiumUntil: true,
      },
    });
    return res.status(200).json({ user });
  } catch (e) {
    console.error('[grant-premium]', e);
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }
}
