import type { DefaultSession, DefaultUser } from 'next-auth'
import type { DefaultJWT } from 'next-auth/jwt'
import type { Role } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      username?: string | null
      /** ISO string; null veya geçmiş tarih → premium değil */
      premiumUntil?: string | null
      /** Hesaplanmış kolaylık alanı: role/premiumUntil'den türetilir */
      isPremium?: boolean
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: Role
    username?: string | null
    premiumUntil?: Date | string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role?: Role
    username?: string | null
    /** ISO string; session'a aktarılır */
    premiumUntil?: string | null
    /** Throttle DB role refresh (ms since epoch) */
    roleSyncedAt?: number
  }
}
