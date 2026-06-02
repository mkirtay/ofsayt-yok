/**
 * Paylaşılan hesap oluşturma çekirdeği.
 * Hem web (`/api/auth/register`) hem mobil (`/api/mobile/auth/register`) bunu kullanır;
 * böylece doğrulama ve oluşturma mantığı tek yerde kalır.
 */
import { hash } from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAndSendEmailVerification } from '@/lib/security';
import { validatePassword, usernameRules } from '@/lib/validation';

export type CreateAccountInput = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  username?: unknown;
};

export type CreatedAccount = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  username: string | null;
};

export type CreateAccountResult =
  | { ok: true; user: CreatedAccount }
  | { ok: false; status: number; error: string };

export async function createUserAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  const { name, email, password, username } = input;

  if (!email || !password) {
    return { ok: false, status: 400, error: 'E-posta ve şifre zorunludur' };
  }

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'E-posta ve şifre zorunludur' };
  }

  if (typeof password !== 'string' || !validatePassword(password).valid) {
    return {
      ok: false,
      status: 400,
      error:
        'Sifre en az 10 karakter olmali, buyuk harf, kucuk harf, rakam ve ozel karakter icermelidir.',
    };
  }

  let usernameNorm: string | null = null;
  if (username !== undefined && username !== null && username !== '') {
    if (typeof username !== 'string' || !usernameRules.pattern.test(username.trim())) {
      return { ok: false, status: 400, error: usernameRules.message };
    }
    usernameNorm = username.trim();
    const taken = await prisma.user.findUnique({ where: { username: usernameNorm } });
    if (taken) {
      return { ok: false, status: 409, error: 'Bu kullanıcı adı alınmış.' };
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { ok: false, status: 409, error: 'Bu e-posta adresi zaten kayıtlı' };
  }

  const hashed = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name: typeof name === 'string' && name ? name : null,
      email: normalizedEmail,
      password: hashed,
      username: usernameNorm,
    },
    select: { id: true, email: true, name: true, role: true, username: true },
  });

  void createAndSendEmailVerification(normalizedEmail).catch((e) =>
    console.error('[accounts] email verification send failed:', e)
  );

  return { ok: true, user };
}
