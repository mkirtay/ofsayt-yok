import type { NextApiRequest, NextApiResponse } from 'next'
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit'
import { checkSignupTurnstile } from '@/lib/security'
import { createUserAccount } from '@/lib/accounts'
import { parseSignupAttribution } from '@/utils/signupAttribution'

const REGISTER_LIMIT = 5
const REGISTER_WINDOW_MS = 15 * 60 * 1000

// Kimlik JSON'u (e-posta, şifre, Turnstile belirteci) birkaç KB; Next varsayılanı 1 MB yerine 16 KB — aşılırsa 413.
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress)
  const limitState = await hitFixedWindowRateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS, { failClosed: true })
  if (!limitState.success) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((limitState.resetAt - Date.now()) / 1000)).toString())
    return res.status(429).json({ error: 'Cok fazla kayit denemesi. Lutfen daha sonra tekrar deneyin.' })
  }

  const { name, email, password, username, turnstileToken, attribution, referralCode } = req.body ?? {}

  // Üretimde zorunlu; anahtar yoksa kayıt reddedilir (bkz. lib/security.ts → checkSignupTurnstile)
  const turnstile = await checkSignupTurnstile(turnstileToken, ip)
  if (!turnstile.ok) {
    return res.status(turnstile.status).json({ error: turnstile.error })
  }

  // Kayıt kaynağı geçersizse kayıt yine yapılır, yalnız kaynak yazılmaz.
  const result = await createUserAccount({ name, email, password, username, attribution: parseSignupAttribution(attribution), referralCode })
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error })
  }

  return res.status(201).json({ user: result.user })
}
