import type { NextApiRequest, NextApiResponse } from 'next'
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { isOAuthCallback, withoutSessionCookies } from '@/lib/oauthCallbackGuard'
import { hitLoginRateLimit, isCredentialsCallback } from '@/lib/loginRateLimit'
import { requestIp } from '@/lib/rateLimit'
import { siteBaseUrl } from '@/lib/siteUrl'

export { authOptions } from '@/lib/auth-options'

const nextAuthHandler = NextAuth(authOptions)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // OAuth dönüşünde açık oturum, Google hesabını o kullanıcıya bağlatmasın (bkz. lib/oauthCallbackGuard.ts)
  if (isOAuthCallback(req.query.nextauth)) {
    req.cookies = withoutSessionCookies(req.cookies)
  }
  // Kaba kuvvet: IP + hesap ve IP başına sınır (bkz. lib/loginRateLimit.ts). Yanıt NextAuth'un `signIn(redirect:
  // false)` biçiminde: istemci `result.error === 'RateLimited'` görür.
  if (isCredentialsCallback(req.method, req.query.nextauth)) {
    const body = (req.body ?? {}) as Record<string, unknown>
    const identifier = typeof body.identifier === 'string' ? body.identifier : ''
    const ip = requestIp(req.headers, req.socket?.remoteAddress)
    const rl = await hitLoginRateLimit(ip, identifier)
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
      return res.status(429).json({ url: `${siteBaseUrl()}/auth/signin?error=RateLimited` })
    }
  }
  return nextAuthHandler(req, res)
}
