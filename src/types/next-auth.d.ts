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
      /** Kullanım Şartları + Gizlilik onayı kayıtlı mı (User.termsAcceptedAt); bilinmiyorsa undefined */
      termsAccepted?: boolean
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: Role
    username?: string | null
    credits?: number
    termsAcceptedAt?: Date | string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role?: Role
    username?: string | null
    /** Güncel AI analiz kredisi bakiyesi; session'a aktarılır */
    credits?: number
    /** Oturum sürümü (User.tokenVersion); her kontrolde karşılaştırılır (lib/sessionVersion.ts) */
    tokenVersion?: number
    /** Kullanım Şartları onayı kayıtlı mı (60 sn'de bir / onay sonrası DB'den) */
    termsAccepted?: boolean
    /** Kredi / profil alanlarının son DB tazelemesi (ms; 60 sn'de bir) */
    roleSyncedAt?: number
  }
}
