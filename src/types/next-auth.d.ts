import type { DefaultSession, DefaultUser } from 'next-auth'
import type { DefaultJWT } from 'next-auth/jwt'
import type { Role } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      username?: string | null
      /** Güncel AI analiz kredisi bakiyesi */
      credits?: number
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: Role
    username?: string | null
    credits?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role?: Role
    username?: string | null
    /** Güncel AI analiz kredisi bakiyesi; session'a aktarılır */
    credits?: number
    /** Throttle DB role/credits refresh (ms since epoch) */
    roleSyncedAt?: number
  }
}
