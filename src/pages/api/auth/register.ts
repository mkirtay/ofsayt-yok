import type { NextApiRequest, NextApiResponse } from 'next'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, password } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' })
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' })
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
    },
    select: { id: true, email: true, name: true, role: true },
  })

  return res.status(201).json({ user })
}
