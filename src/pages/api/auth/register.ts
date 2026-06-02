import type { NextApiRequest, NextApiResponse } from 'next'
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit'
import { verifyTurnstileToken } from '@/lib/security'
import { createUserAccount } from '@/lib/accounts'

const REGISTER_LIMIT = 5
const REGISTER_WINDOW_MS = 15 * 60 * 1000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress)
  const limitState = await hitFixedWindowRateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS)
  if (!limitState.success) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((limitState.resetAt - Date.now()) / 1000)).toString())
    return res.status(429).json({ error: 'Cok fazla kayit denemesi. Lutfen daha sonra tekrar deneyin.' })
  }

  const { name, email, password, username, turnstileToken } = req.body ?? {}

  if (process.env.NODE_ENV === 'production' && process.env.TURNSTILE_SECRET_KEY) {
    if (typeof turnstileToken !== 'string' || !turnstileToken) {
      return res.status(400).json({ error: 'Guvenlik dogrulamasi basarisiz.' })
    }

    const turnstileOk = await verifyTurnstileToken(turnstileToken, ip)
    if (!turnstileOk) {
      return res.status(400).json({ error: 'Guvenlik dogrulamasi basarisiz.' })
    }
  }

  const result = await createUserAccount({ name, email, password, username })
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error })
  }

  return res.status(201).json({ user: result.user })
}
