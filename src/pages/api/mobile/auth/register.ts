import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { createUserAccount } from '@/lib/accounts';
import { issueMobileToken } from '@/lib/mobileAuth';

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

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
  const rl = await hitFixedWindowRateLimit(`mobile-register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.' });
  }

  const body = parseBody(req);

  const result = await createUserAccount({
    name: body.name,
    email: body.email,
    password: body.password,
    username: body.username,
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  // Kayıt sonrası otomatik giriş: token ver (email doğrulaması girişi engellemiyor)
  const premiumRow = await prisma.user.findUnique({
    where: { id: result.user.id },
    select: { premiumUntil: true },
  });
  const premiumUntilIso = premiumRow?.premiumUntil ? premiumRow.premiumUntil.toISOString() : null;

  const token = await issueMobileToken({
    sub: result.user.id,
    role: result.user.role,
    premiumUntil: premiumUntilIso,
    email: result.user.email,
    name: result.user.name,
    username: result.user.username,
  });

  return res.status(201).json({
    token,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      username: result.user.username,
      premiumUntil: premiumUntilIso,
      isPremium: false,
    },
  });
}
