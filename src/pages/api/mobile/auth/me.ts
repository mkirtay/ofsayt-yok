import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestAuth } from '@/lib/mobileAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await getRequestAuth(req, res);
  if (!auth) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  // Rol/kredi bilgisini DB'den taze al (token bayatlamış olabilir)
  const user = await prisma.user.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      bio: true,
      image: true,
      role: true,
      credits: true,
      favoriteTeamIds: true,
      favoriteLeagueIds: true,
    },
  });

  if (!user) {
    return res.status(401).json({ error: 'Oturum geçersiz.' });
  }

  res.setHeader('Cache-Control', 'private, no-cache');
  return res.status(200).json({
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    bio: user.bio,
    image: user.image,
    role: user.role,
    credits: user.credits,
    favoriteTeamIds: user.favoriteTeamIds,
    favoriteLeagueIds: user.favoriteLeagueIds,
  });
}
