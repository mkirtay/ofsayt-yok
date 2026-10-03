/**
 * OAuth (şimdilik yalnızca Google) girişinin sunucu tarafı kuralları. `auth-options.ts` bunları kullanır;
 * saf fonksiyonlar ayrı durduğu için NextAuth'u ayağa kaldırmadan test edilebilir.
 *
 * Akış: hesabı yoksa Google profilinden oluşturulur; aynı e-postalı hesabı varsa Google hesabı e-postaya göre ona
 * bağlanır ve o hesapla girilir (`allowDangerousEmailAccountLinking`). Güvenlik: Google e-postası doğrulanmış olmalı
 * (`checkOAuthSignIn`), bizde doğrulanmamış hesabın şifresi bağlanırken silinir (`onOAuthAccountLinked`), açık
 * oturumdaki BAŞKA kullanıcıya bağlanma `oauthCallbackGuard` ile engellenir.
 */
import type { Provider } from 'next-auth/providers/index';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';
import { grantVerifiedSignupBonus } from '@/lib/credits';
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
      // Aynı e-postalı mevcut hesaba bağlan → o hesapla giriş (bkz. dosya başı güvenlik notları)
      allowDangerousEmailAccountLinking: true,
      profile: googleProfileToUser,
    }),
  ];
}

/**
 * NextAuth `signIn` callback'inin OAuth kısmı. Kullanıcı oluşturulmadan / hesap bağlanmadan ÖNCE çalışır.
 * Google e-postası doğrulanmamışsa giriş reddedilir (giriş sayfasına hata koduyla yönlendirme) — e-postaya göre
 * mevcut hesaba bağlamanın güvenliği bu doğrulamaya dayanır.
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
 * NextAuth `events.linkAccount`: Google hesabı bir kullanıcıya bağlandı (yeni kullanıcı ya da e-postası eşleşen mevcut
 * hesap). E-postası bizde doğrulanmamış mevcut hesabın şifresini, e-postanın sahibi olmayan biri koymuş olabilir
 * (önceden hesap açıp bekleme saldırısı) → e-posta doğrulanmış işaretlenir ve o şifre silinir; gerçek sahip isterse
 * "şifremi unuttum" ile yeni şifre alır. Doğrulanmış hesaplara dokunulmaz.
 */
export async function onOAuthAccountLinked(userId: string): Promise<void> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, emailVerified: null },
    data: { emailVerified: new Date(), password: null },
  });
  // E-posta bu bağlamayla doğrulandı → kayıt bonusu (bir kez; 5 kredi almış eski hesaplara yok).
  if (count > 0) await grantVerifiedSignupBonus(userId);
}

/**
 * NextAuth `events.createUser`: adapter yalnızca OAuth ilk girişinde kullanıcı oluşturur (şifreli kayıt
 * `createUserAccount` ile doğrudan Prisma'ya yazar); e-postayla mevcut hesaba bağlamada da çağrılır, orada no-op.
 * `signIn` callback'i e-postanın Google'da doğrulandığını garanti ettiği için `emailVerified` işaretlenir;
 * kayıt bonusu (kredi modeli v2: 2 kredi, bir kez) doğrulanmış e-postaya verilir.
 */
export async function onOAuthUserCreated(userId: string): Promise<void> {
  // NextAuth bu olayı e-postayla MEVCUT hesaba bağlarken de çağırıyor → yalnızca az önce oluşmuş, şifresiz kayıt "yeni"dir.
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, createdAt: true } });
  if (!row || row.password || Date.now() - row.createdAt.getTime() > FRESH_USER_MS) return;
  // Adapter kullanıcıyı DB varsayılanıyla oluşturur (migration B'ye kadar 5) → v2'de 0'dan başlar, bonus 2.
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date(), credits: 0 } });
  await grantVerifiedSignupBonus(userId);
}

/** OAuth ile oluşturulan kaydın "yeni" sayıldığı süre (createUser olayı oluşturmanın hemen ardından gelir). */
const FRESH_USER_MS = 5 * 60 * 1000;
