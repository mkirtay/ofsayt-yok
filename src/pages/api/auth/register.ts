import type { NextApiRequest, NextApiResponse } from 'next'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit'
import { verifyTurnstileToken } from '@/lib/security'
import { validatePassword, usernameRules } from '@/lib/validation'

const REGISTER_LIMIT = 5
const REGISTER_WINDOW_MS = 15 * 60 * 1000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress)
  const limitState = hitFixedWindowRateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS)
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

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' })
  }

  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' })
  }

  if (typeof password !== 'string' || !validatePassword(password).valid) {
    return res.status(400).json({
      error:
        'Sifre en az 10 karakter olmali, buyuk harf, kucuk harf, rakam ve ozel karakter icermelidir.',
    })
  }

  let usernameNorm: string | null = null
  if (username !== undefined && username !== null && username !== '') {
    if (typeof username !== 'string' || !usernameRules.pattern.test(username.trim())) {
      return res.status(400).json({
        error: usernameRules.message,
      })
    }
    usernameNorm = username.trim()
    const taken = await prisma.user.findUnique({ where: { username: usernameNorm } })
    if (taken) {
      return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' })
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı' })
  }

  const hashed = await hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name: name || null,
      email: normalizedEmail,
      password: hashed,
      username: usernameNorm,
    },
    select: { id: true, email: true, name: true, role: true, username: true },
  })

  return res.status(201).json({ user })
}
