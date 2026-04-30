import type { NextApiRequest, NextApiResponse } from 'next';
import { consumeEmailVerificationToken } from '@/lib/security';

function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawToken = typeof req.query.token === 'string' ? req.query.token : '';
  if (!rawToken) {
    return res.redirect(`${appBaseUrl()}/auth/signin?verified=invalid`);
  }

  try {
    const ok = await consumeEmailVerificationToken(rawToken);
    return res.redirect(`${appBaseUrl()}/auth/signin?verified=${ok ? '1' : '0'}`);
  } catch (error) {
    console.error('[verify-email]', error);
    return res.redirect(`${appBaseUrl()}/auth/signin?verified=0`);
  }
}
