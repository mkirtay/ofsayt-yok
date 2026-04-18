import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const MAX_BIO = 2000;
const MAX_NAME = 80;
const MAX_IMAGE_URL = 2048;

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
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  try {
    if (req.method === 'GET') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          bio: true,
          image: true,
          role: true,
        },
      });
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
      }
      return res.status(200).json(user);
    }

    if (req.method === 'PATCH') {
      const body = parseJsonBody(req);

      const nameRaw = body.name;
      const imageRaw = body.image;
      const usernameRaw = body.username;
      const bioRaw = body.bio;

      const data: {
        name?: string | null;
        image?: string | null;
        username?: string | null;
        bio?: string | null;
      } = {};

      if (nameRaw !== undefined) {
        if (nameRaw === null) {
          data.name = null;
        } else if (typeof nameRaw === 'string') {
          const t = nameRaw.trim();
          if (t.length > MAX_NAME) {
            return res.status(400).json({ error: `İsim en fazla ${MAX_NAME} karakter olabilir.` });
          }
          data.name = t === '' ? null : t;
        } else {
          return res.status(400).json({ error: 'Geçersiz isim alanı.' });
        }
      }

      if (imageRaw !== undefined) {
        if (imageRaw === null) {
          data.image = null;
        } else if (typeof imageRaw === 'string') {
          const t = imageRaw.trim();
          if (t.length > MAX_IMAGE_URL) {
            return res.status(400).json({ error: 'Profil görseli URL’si çok uzun.' });
          }
          data.image = t === '' ? null : t;
        } else {
          return res.status(400).json({ error: 'Geçersiz görsel alanı.' });
        }
      }

      if (usernameRaw !== undefined) {
        if (usernameRaw === null || usernameRaw === '') {
          data.username = null;
        } else if (typeof usernameRaw === 'string') {
          const t = usernameRaw.trim();
          if (t === '') {
            data.username = null;
          } else if (!USERNAME_RE.test(t)) {
            return res.status(400).json({
              error: 'Kullanıcı adı 3–30 karakter; yalnızca harf, rakam ve alt çizgi.',
            });
          } else {
            data.username = t;
          }
        } else {
          return res.status(400).json({ error: 'Geçersiz kullanıcı adı alanı.' });
        }
      }

      if (bioRaw !== undefined) {
        if (bioRaw === null) {
          data.bio = null;
        } else if (typeof bioRaw === 'string') {
          const t = bioRaw.trim();
          if (t.length > MAX_BIO) {
            return res.status(400).json({ error: `Hakkımda en fazla ${MAX_BIO} karakter olabilir.` });
          }
          data.bio = t === '' ? null : t;
        } else {
          return res.status(400).json({ error: 'Geçersiz bio alanı.' });
        }
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Güncellenecek alan yok.' });
      }

      if (data.username !== undefined && data.username !== null) {
        const taken = await prisma.user.findFirst({
          where: { username: data.username, NOT: { id: userId } },
          select: { id: true },
        });
        if (taken) {
          return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' });
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          bio: true,
          image: true,
          role: true,
        },
      });

      return res.status(200).json(user);
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).end();
  } catch (e) {
    console.error('[user/me]', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
