import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

const MAX_FAVORITES = 50;

function parseIntArray(val: unknown): number[] | null {
  if (!Array.isArray(val)) return null;
  if (val.length > MAX_FAVORITES) return null;
  const result: number[] = [];
  for (const item of val) {
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) return null;
    result.push(n);
  }
  return result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  try {
    if (req.method === 'GET') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { favoriteTeamIds: true, favoriteLeagueIds: true },
      });
      if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
      return res.status(200).json(user);
    }

    if (req.method === 'PATCH') {
      const body = req.body ?? {};
      const data: { favoriteTeamIds?: number[]; favoriteLeagueIds?: number[] } = {};

      if (body.favoriteTeamIds !== undefined) {
        const parsed = parseIntArray(body.favoriteTeamIds);
        if (parsed === null) {
          return res.status(400).json({ error: 'Geçersiz favoriteTeamIds.' });
        }
        data.favoriteTeamIds = parsed;
      }

      if (body.favoriteLeagueIds !== undefined) {
        const parsed = parseIntArray(body.favoriteLeagueIds);
        if (parsed === null) {
          return res.status(400).json({ error: 'Geçersiz favoriteLeagueIds.' });
        }
        data.favoriteLeagueIds = parsed;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Güncellenecek alan yok.' });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data,
        select: { favoriteTeamIds: true, favoriteLeagueIds: true },
      });

      return res.status(200).json(user);
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).end();
  } catch (e) {
    console.error('[user/favorites]', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
