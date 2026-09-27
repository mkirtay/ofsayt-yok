/**
 * OAuth (şimdilik yalnızca Google) girişinin sunucu tarafı kuralları. `auth-options.ts` bunları kullanır;
 * saf fonksiyonlar ayrı durduğu için NextAuth'u ayağa kaldırmadan test edilebilir.
 *
 * Hesap bağlama kuralı: aynı e-postayla şifreli bir hesap varsa Google hesabı ona OTOMATİK BAĞLANMAZ
 * (`allowDangerousEmailAccountLinking` kapalı) — NextAuth `OAuthAccountNotLinked` hatasıyla giriş sayfasına döner.
 */
import type { Provider } from 'next-auth/providers/index';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';
import { recordSignupBonus } from '@/lib/credits';
import { isGoogleAuthEnabled } from '@/lib/oauthEnv';

export { isGoogleAuthEnabled };

type Env = Record<string, string | undefined>;

/** Giriş sayfasına özel hata kodu: Google e-postası doğrulanmamış. */
export const GOOGLE_EMAIL_NOT_VERIFIED = 'GoogleEmailNotVerified';

/** Google profilinden DB'ye yazılacak kullanıcı alanları (adapter `createUser`'a gider). Rol/kredi DB varsayılanı. */
export function googleProfileToUser(profile: GoogleProfile) {
  return {
    id: profile.sub,
    name: profile.name?.trim() || null,
    email: profile.email.trim().toLowerCase(),
    image: profile.picture || null,
    role: 'USER' as const,
    username: null,
  };
}

/** Env'e göre OAuth provider listesi (Credentials hariç). */
export function oauthProviders(env: Env = process.env): Provider[] {
  if (!isGoogleAuthEnabled(env)) return [];
  return [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
      allowDangerousEmailAccountLinking: false,
      profile: googleProfileToUser,
    }),
  ];
}

/**
 * NextAuth `signIn` callback'inin OAuth kısmı. Kullanıcı oluşturulmadan ÖNCE çalışır.
 * Google e-postası doğrulanmamışsa giriş reddedilir (giriş sayfasına hata koduyla yönlendirme).
 */
export function checkOAuthSignIn(
  provider: string | undefined,
  profile: { email_verified?: unknown } | undefined,
): true | string {
  if (provider === 'google' && profile?.email_verified !== true) {
    return `/auth/signin?error=${GOOGLE_EMAIL_NOT_VERIFIED}`;
  }
  return true;
}

/**
 * NextAuth `events.createUser`: adapter yalnızca OAuth ilk girişinde kullanıcı oluşturur (şifreli kayıt
 * `createUserAccount` ile doğrudan Prisma'ya yazar), bu yüzden burası yalnız OAuth kullanıcıları için çalışır.
 * `signIn` callback'i e-postanın Google'da doğrulandığını garanti ettiği için `emailVerified` işaretlenir;
 * başlangıç kredisi kayıtla aynı tek kaynaktan (idempotent) defterlenir.
 */
export async function onOAuthUserCreated(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  await recordSignupBonus(userId);
}
