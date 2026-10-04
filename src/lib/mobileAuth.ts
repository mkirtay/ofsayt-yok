/**
 * Mobil (React Native / Expo) istemciler için token tabanlı kimlik doğrulama.
 *
 * Web tarafı NextAuth cookie kullanır; mobilde cookie yönetimi zahmetli olduğu için
 * `Authorization: Bearer <token>` ile çalışırız. Token, NextAuth'un kendi JWT
 * encode/decode'u ile üretilir (aynı AUTH_SECRET) — böylece tek bir secret yeterli.
 *
 * `getRequestAuth` HEM cookie HEM Bearer kabul eder; bu sayede mevcut korumalı
 * endpoint'ler tek satır değişiklikle hem web hem mobil isteklerine cevap verir.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { encode, decode } from 'next-auth/jwt';
import type { Role } from '@prisma/client';
import { authOptions, tokenVersionOf } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';
const MOBILE_TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 gün

export type MobileTokenClaims = {
  sub: string;
  role?: Role | null;
  credits?: number | null;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  /** User.tokenVersion — şifre değişince artar; eşleşmeyen belirteç reddedilir. */
  tokenVersion?: number | null;
};

export type RequestAuthUser = {
  id: string;
  role: Role | null;
  credits: number | null;
  email: string | null;
  name: string | null;
  username: string | null;
};

/** Mobil login/register sonrası imzalı (şifreli) JWT üretir. */
export async function issueMobileToken(claims: MobileTokenClaims): Promise<string> {
  return encode({
    token: {
      sub: claims.sub,
      ...(claims.role ? { role: claims.role } : {}),
      credits: claims.credits ?? 0,
      email: claims.email ?? null,
      name: claims.name ?? null,
      username: claims.username ?? null,
      tokenVersion: claims.tokenVersion ?? 0,
    },
    secret: SECRET,
    maxAge: MOBILE_TOKEN_MAX_AGE_SEC,
  });
}

function bearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** İstek mobil Bearer belirteci taşıyor mu (yanıtta yeni belirteç dönülecek mi). */
export function hasBearerToken(req: NextApiRequest): boolean {
  return bearerToken(req) !== null;
}

/**
 * İsteğin sahibi kullanıcıyı döndürür. Önce Bearer token (mobil), yoksa NextAuth
 * cookie session (web) denenir. Kimlik yoksa `null`.
 */
export async function getRequestAuth(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<RequestAuthUser | null> {
  const token = bearerToken(req);
  if (token) {
    let decoded: Awaited<ReturnType<typeof decode>> = null;
    try {
      decoded = await decode({ token, secret: SECRET });
    } catch {
      // Geçersiz/expired token → cookie session'a düş
    }
    if (decoded?.sub) {
      // Her istekte DB: sürüm eşleşmeli (şifre değişince / sıfırlanınca eski belirteçler düşer); rol ve diğer alanlar
      // belirteçten değil DB'den (30 günlük belirteçte eski rol kalmasın). Eşleşmezse cookie'ye de düşülmez.
      const row = await prisma.user.findUnique({
        where: { id: String(decoded.sub) },
        select: { id: true, role: true, credits: true, email: true, name: true, username: true, tokenVersion: true },
      });
      if (!row || row.tokenVersion !== tokenVersionOf(decoded)) return null;
      return {
        id: row.id,
        role: row.role,
        credits: row.credits,
        email: row.email,
        name: row.name,
        username: row.username,
      };
    }
  }

  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.id) {
    return {
      id: session.user.id,
      role: (session.user.role ?? null) as Role | null,
      credits: session.user.credits ?? null,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      username: session.user.username ?? null,
    };
  }

  return null;
}

/** Yalnızca kullanıcı id'si gereken yerler için kısayol. */
export async function getRequestUserId(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const auth = await getRequestAuth(req, res);
  return auth?.id ?? null;
}
