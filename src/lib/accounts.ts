/**
 * Paylaşılan hesap oluşturma çekirdeği.
 * Hem web (`/api/auth/register`) hem mobil (`/api/mobile/auth/register`) bunu kullanır;
 * böylece doğrulama ve oluşturma mantığı tek yerde kalır.
 */
import { hash } from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isDisposableEmail } from '@/lib/disposableEmail';
import { canonicalEmail, sameMailboxWhere } from '@/lib/emailNormalize';
import { recordReferral } from '@/lib/referral';
import { createAndSendEmailVerification } from '@/lib/security';
import { validatePassword, usernameRules } from '@/lib/validation';
import type { SignupAttributionFields } from '@/utils/signupAttribution';

export type CreateAccountInput = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  username?: unknown;
  /** Kayıt kaynağı (ilk temas) — doğrulanmış; yoksa yazılmaz. */
  attribution?: SignupAttributionFields | null;
  /** Davet kodu (isteğe bağlı) — geçersizse yok sayılır; ödül ilk satın almada (lib/referral.ts). */
  referralCode?: unknown;
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
  const { name, email, password, username, attribution, referralCode } = input;

  if (!email || !password) {
    return { ok: false, status: 400, error: 'E-posta ve şifre zorunludur' };
  }

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'E-posta ve şifre zorunludur' };
  }

  const emailNormalized = canonicalEmail(normalizedEmail);

  // Kredi modeli v2: kayıt bonusu / haftalık ücretsiz açma suistimaline karşı geçici e-posta ile kayıt yok. Kanonik biçim
  // de denenir (Unicode/tam genişlik alan adı → punycode/ASCII).
  if (isDisposableEmail(normalizedEmail) || isDisposableEmail(emailNormalized)) {
    return { ok: false, status: 400, error: 'Geçici (tek kullanımlık) e-posta adresleriyle kayıt olunamıyor.' };
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

  // Aynı posta kutusu (her alan adında `+etiket`, gmail'de nokta varyantları) → ikinci hesap (ve ikinci kayıt bonusu)
  // yok. Eski kayıtlarda `emailNormalized` boş ya da eski kuralla yazılmış: ham e-postada kanonik biçim ve `taban+…@alan`
  // varyantı da aranır (lib/emailNormalize.ts → sameMailboxWhere).
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, ...sameMailboxWhere(emailNormalized)] },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, status: 409, error: 'Bu e-posta adresi zaten kayıtlı' };
  }

  const hashed = await hash(password, 12);

  let user: CreatedAccount;
  try {
    user = await prisma.user.create({
      data: {
        name: typeof name === 'string' && name ? name : null,
        email: normalizedEmail,
        emailNormalized,
        password: hashed,
        username: usernameNorm,
        // Kredi modeli v2: 0 ile başlar; e-posta doğrulanınca +2 (lib/credits.ts → grantVerifiedSignupBonus). Açıkça
        // yazılır: DB varsayılanı migration B'ye kadar 5.
        credits: 0,
        ...(attribution ?? {}),
      },
      select: { id: true, email: true, name: true, role: true, username: true, credits: true },
    });
  } catch (err) {
    // Eşzamanlı ikinci kayıt: `email` / `emailNormalized` benzersiz indeksi
    if ((err as { code?: string } | null)?.code === 'P2002') {
      return { ok: false, status: 409, error: 'Bu e-posta adresi zaten kayıtlı' };
    }
    throw err;
  }

  if (referralCode != null) {
    // En iyi çaba: davet kaydı yazılamazsa kayıt yine başarılı.
    await recordReferral(user.id, referralCode).catch((e) => console.error('[accounts] referral record failed:', e));
  }

  void createAndSendEmailVerification(normalizedEmail).catch((e) =>
    console.error('[accounts] email verification send failed:', e)
  );

  return { ok: true, user };
}
