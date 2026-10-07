import type { NextAuthOptions } from 'next-auth';
import type { Role } from '@prisma/client';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSessionVersion } from '@/lib/sessionVersion';
import {
  checkOAuthSignIn,
  EMAIL_ALREADY_REGISTERED,
  isDuplicateMailboxOAuthSignup,
  oauthProviders,
  onOAuthAccountLinked,
  onOAuthUserCreated,
  prepareOAuthEmailLink,
} from '@/lib/oauth';

const ROLE_REFRESH_MS = 60_000;

/** Oturum sürümü eşleşmedi (şifre değişti / sıfırlandı) ya da kullanıcı silindi → NextAuth oturum çerezini temizler. */
export class SessionRevokedError extends Error {
  constructor() {
    super('SESSION_REVOKED');
    this.name = 'SessionRevokedError';
  }
}

/** Belirteçteki oturum sürümü (bu alan eklenmeden önce verilmiş belirteçler 0 sayılır — toplu çıkış olmaz). */
export function tokenVersionOf(token: { tokenVersion?: unknown }): number {
  return typeof token.tokenVersion === 'number' ? token.tokenVersion : 0;
}

/** JWT'ye yazılabilir premium bitişi (Date nesnesi JWT'de string'e döner; tek biçim ISO). */
function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  session: { strategy: 'jwt' },

  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'E-posta veya kullanıcı adı', type: 'text' },
        password: { label: 'Şifre', type: 'password' },
      },
      async authorize(credentials) {
        const loginId =
          (typeof credentials?.identifier === 'string' && credentials.identifier) ||
          '';

        if (!loginId || !credentials?.password) return null;

        const identifier = loginId.trim();
        if (!identifier) return null;

        const isEmailLike = identifier.includes('@');

        const user = await prisma.user.findUnique({
          where: isEmailLike
            ? { email: identifier.toLowerCase() }
            : { username: identifier },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            password: true,
            role: true,
            username: true,
            credits: true,
            premiumUntil: true,
            tokenVersion: true,
          },
        });

        if (!user?.password) return null;

        const valid = await compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          username: user.username,
          credits: user.credits,
          premiumUntil: user.premiumUntil,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
    // Google yalnızca GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET tanımlıysa (bkz. lib/oauth.ts)
    ...oauthProviders(),
  ],

  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account || account.type !== 'oauth') return true;
      const verdict = checkOAuthSignIn(account.provider, profile as { email_verified?: unknown } | undefined);
      if (verdict !== true) return verdict;
      if (await isDuplicateMailboxOAuthSignup(account.provider, account.providerAccountId, user.email)) {
        return `/auth/signin?error=${EMAIL_ALREADY_REGISTERED}`;
      }
      // E-postayla mevcut (şifreli / doğrulanmamış) hesaba bağlanacaksa: şifre silinir, tokenVersion artar, eski
      // oturumlar düşer — callbackHandler kullanıcıyı bundan SONRA okuduğu için yeni oturum güncel sürümü taşır.
      await prepareOAuthEmailLink(account.provider, account.providerAccountId, user.email);
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image ?? undefined;
        token.username = (user as { username?: string | null }).username ?? null;
        token.credits = (user as { credits?: number }).credits ?? 0;
        token.premiumUntil = toIso((user as { premiumUntil?: Date | string | null }).premiumUntil);
        // Credentials `authorize` ve OAuth adapter kullanıcısı (tam satır) tokenVersion taşır.
        token.tokenVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
        token.roleSyncedAt = Date.now();
      }
      if (!user && token.sub) {
        // Her oturum kontrolünde sürüm karşılaştırılır (Redis'te 60 sn önbellek, şifre değişince silinir — bkz.
        // lib/sessionVersion.ts): şifre değişince / sıfırlanınca eski oturumlar düşer.
        const version = await getSessionVersion(token.sub);
        if (!version || version.tokenVersion !== tokenVersionOf(token)) throw new SessionRevokedError();
        token.role = version.role;
        // Diğer alanlar (kredi, premium, ad, avatar) 60 sn'de bir DB'den.
        const last = typeof token.roleSyncedAt === 'number' ? token.roleSyncedAt : 0;
        if (Date.now() - last > ROLE_REFRESH_MS) {
          const row = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true, username: true, name: true, image: true, credits: true, premiumUntil: true },
          });
          if (!row) throw new SessionRevokedError();
          token.role = row.role;
          token.username = row.username;
          token.name = row.name;
          token.picture = row.image ?? undefined;
          token.credits = row.credits;
          token.premiumUntil = toIso(row.premiumUntil);
          token.roleSyncedAt = Date.now();
        }
      }
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as Record<string, unknown>;
        if ('name' in s) token.name = typeof s.name === 'string' ? s.name : null;
        if ('image' in s) {
          token.picture =
            typeof s.image === 'string' && s.image ? s.image : undefined;
        }
        if ('username' in s) {
          token.username =
            typeof s.username === 'string' || s.username === null ? s.username : null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        if (token.role) session.user.role = token.role;
        if (token.name !== undefined) session.user.name = token.name as string | null;
        if (token.email) session.user.email = token.email as string;
        if (token.picture !== undefined) session.user.image = (token.picture as string) || null;
        if (token.username !== undefined) {
          session.user.username = token.username as string | null;
        }
        session.user.credits = (token.credits as number | undefined) ?? 0;
        session.user.premiumUntil = token.premiumUntil ?? null;
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      await onOAuthUserCreated(user.id);
    },
    async linkAccount({ user }) {
      await onOAuthAccountLinked(user.id);
    },
  },

  pages: {
    signIn: '/auth/signin',
    // OAuth hataları (AccessDenied vb.) varsayılan NextAuth sayfası yerine giriş sayfasında `?error=` ile gösterilir
    error: '/auth/signin',
  },

  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
};
