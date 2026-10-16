/**
 * GET /api/user/summary — profil başlık kartı ve istatistikleri için TEK istek. Yalnız oturum sahibinin kendi verisi
 * (kimlik oturumdan; sorgu parametresi okunmaz). Yalnız sayımlar ve rozet bilgisi döner — e-posta, ad vb. yok
 * (onlar /api/user/me'de). Yanıt kullanıcıya özel: `private, no-store`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/mobileAuth';
import { isAdminUser } from '@/lib/userRole';

export type UserSummaryDto = {
  memberSince: string;
  credits: number;
  /** Premium kaldırıldı: sabit false / null (mobil ve eski istemciler alanı okuyor; dolu dönerse "sınırsız" sanar). */
  premium: false;
  premiumUntil: null;
  admin: boolean;
  counts: {
    analyses: number;
    favoriteTeams: number;
    favoriteLeagues: number;
    posts: number;
    followers: number;
    following: number;
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getRequestUserId(req, res);
  if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, credits: true, role: true, favoriteTeamIds: true, favoriteLeagueIds: true },
  });
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });

  const [analyses, posts, followers, following] = await Promise.all([
    prisma.analysisUnlock.count({ where: { userId } }),
    prisma.post.count({ where: { authorId: userId, deletedAt: null } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  const body: UserSummaryDto = {
    memberSince: user.createdAt.toISOString(),
    credits: user.credits,
    premium: false,
    premiumUntil: null,
    admin: isAdminUser(user),
    counts: {
      analyses,
      favoriteTeams: user.favoriteTeamIds.length,
      favoriteLeagues: user.favoriteLeagueIds.length,
      posts,
      followers,
      following,
    },
  };
  return res.status(200).json(body);
}
