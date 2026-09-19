/**
 * GET /api/credits/history?limit=20&cursor=<id>
 * Kullanıcının TÜM kredi hareketleri (SIGNUP_BONUS, ADMIN_GRANT, ANALYSIS_SPEND, ANALYSIS_FREE, PURCHASE, REFUND),
 * en yeniden eskiye; cursor (son öğenin id'si) ile sayfalanır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/mobileAuth';
import { parseHistoryQuery } from '@/lib/creditHistory';

export type CreditHistoryItem = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  matchId: string | null;
  /** Analiz hareketlerinde "Ev - Deplasman"; yoksa null. */
  matchLabel: string | null;
  createdAt: string;
};

export type CreditHistoryPage = { items: CreditHistoryItem[]; nextCursor: string | null };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const userId = await getRequestUserId(req, res);
  if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

  const { limit, cursor } = parseHistoryQuery(req.query);

  const rows = await prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const matchIds = [...new Set(page.map((r) => r.matchId).filter((m): m is string => !!m))];
  const analyses = matchIds.length
    ? await prisma.matchAnalysis.findMany({
        where: { matchId: { in: matchIds }, matchStatus: 'PRE' },
        select: { matchId: true, homeTeamName: true, awayTeamName: true },
      })
    : [];
  const labelByMatch = new Map(analyses.map((a) => [a.matchId, `${a.homeTeamName} - ${a.awayTeamName}`]));

  const items: CreditHistoryItem[] = page.map((r) => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    note: r.note,
    matchId: r.matchId,
    matchLabel: r.matchId ? (labelByMatch.get(r.matchId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.setHeader('Cache-Control', 'private, no-cache');
  return res.status(200).json({ items, nextCursor: hasMore ? page[page.length - 1].id : null } satisfies CreditHistoryPage);
}
