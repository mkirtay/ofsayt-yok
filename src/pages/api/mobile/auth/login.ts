import type { NextApiRequest, NextApiResponse } from 'next';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { issueMobileToken } from '@/lib/mobileAuth';
import { isUserPremium } from '@/lib/premium';

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function parseBody(req: NextApiRequest): Record<string, unknown> {
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`mobile-login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla giriş denemesi. Lütfen bekleyin.' });
  }

  const body = parseBody(req);
  const identifierRaw = body.emailOrUsername ?? body.identifier;
  const password = body.password;

  const loginId = typeof identifierRaw === 'string' ? identifierRaw.trim() : '';
  if (!loginId || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'E-posta/kullanıcı adı ve şifre gerekli.' });
  }

  const isEmailLike = loginId.includes('@');
  const user = await prisma.user.findUnique({
    where: isEmailLike ? { email: loginId.toLowerCase() } : { username: loginId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      password: true,
      role: true,
      username: true,
      premiumUntil: true,
    },
  });

  // Sabit yanıt: kullanıcı yok ve şifre yanlış aynı mesajı döner (enumeration koruması)
  if (!user?.password || !(await compare(password, user.password))) {
    return res.status(401).json({ error: 'E-posta/kullanıcı adı veya şifre hatalı.' });
  }

  const premiumUntilIso = user.premiumUntil ? user.premiumUntil.toISOString() : null;

  const token = await issueMobileToken({
    sub: user.id,
    role: user.role,
    premiumUntil: premiumUntilIso,
    email: user.email,
    name: user.name,
    username: user.username,
  });

  return res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      username: user.username,
      premiumUntil: premiumUntilIso,
      isPremium: isUserPremium({ role: user.role, premiumUntil: user.premiumUntil }),
    },
  });
}
