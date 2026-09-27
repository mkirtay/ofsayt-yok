import type { NextApiRequest, NextApiResponse } from 'next'
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { isOAuthCallback, withoutSessionCookies } from '@/lib/oauthCallbackGuard'

export { authOptions } from '@/lib/auth-options'

const nextAuthHandler = NextAuth(authOptions)

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // OAuth dönüşünde açık oturum, Google hesabını o kullanıcıya bağlatmasın (bkz. lib/oauthCallbackGuard.ts)
  if (isOAuthCallback(req.query.nextauth)) {
    req.cookies = withoutSessionCookies(req.cookies)
  }
  return nextAuthHandler(req, res)
}
