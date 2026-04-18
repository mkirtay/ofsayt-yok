import type { NextApiRequest, NextApiResponse } from 'next'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, password, username } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' })
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' })
  }

  const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/
  let usernameNorm: string | null = null
  if (username !== undefined && username !== null && username !== '') {
    if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
      return res.status(400).json({
        error: 'Kullanıcı adı 3–30 karakter; yalnızca harf, rakam ve alt çizgi.',
      })
    }
    usernameNorm = username.trim()
    const taken = await prisma.user.findUnique({ where: { username: usernameNorm } })
    if (taken) {
      return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' })
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı' })
  }

  const hashed = await hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name: name || null,
      email,
      password: hashed,
      username: usernameNorm,
    },
    select: { id: true, email: true, name: true, role: true, username: true },
  })

  return res.status(201).json({ user })
}
