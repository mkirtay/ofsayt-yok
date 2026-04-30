import type { NextAuthOptions } from 'next-auth';
import type { Role } from '@prisma/client';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { isUserPremium } from '@/lib/premium';

const ROLE_REFRESH_MS = 60_000;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  session: { strategy: 'jwt' },

  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'E-posta', type: 'email' },
        password: { label: 'Şifre', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            password: true,
            role: true,
            username: true,
            premiumUntil: true,
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
          premiumUntil: user.premiumUntil,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image ?? undefined;
        token.username = (user as { username?: string | null }).username ?? null;
        const pu = (user as { premiumUntil?: Date | string | null }).premiumUntil ?? null;
        token.premiumUntil =
          pu instanceof Date ? pu.toISOString() : (pu ?? null);
        token.roleSyncedAt = Date.now();
      }
      if (!user && token.sub) {
        const last =
          typeof token.roleSyncedAt === 'number' ? token.roleSyncedAt : 0;
        if (Date.now() - last > ROLE_REFRESH_MS) {
          const row = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true, username: true, name: true, image: true, premiumUntil: true },
          });
          if (row) {
            token.role = row.role;
            token.username = row.username;
            token.name = row.name;
            token.picture = row.image ?? undefined;
            token.premiumUntil = row.premiumUntil
              ? row.premiumUntil.toISOString()
              : null;
          }
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
        const premiumUntil = (token.premiumUntil as string | null | undefined) ?? null;
        session.user.premiumUntil = premiumUntil;
        session.user.isPremium = isUserPremium({
          role: token.role,
          premiumUntil,
        });
      }
      return session;
    },
  },

  pages: {
    signIn: '/auth/signin',
  },

  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
};
