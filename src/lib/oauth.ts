/**
 * OAuth (şimdilik yalnızca Google) girişinin sunucu tarafı kuralları. `auth-options.ts` bunları kullanır;
 * saf fonksiyonlar ayrı durduğu için NextAuth'u ayağa kaldırmadan test edilebilir.
 *
 * Akış: hesabı yoksa Google profilinden oluşturulur; aynı e-postalı hesabı varsa Google hesabı e-postaya göre ona
 * bağlanır ve o hesapla girilir (`allowDangerousEmailAccountLinking`). Güvenlik: Google e-postası doğrulanmış olmalı
 * (`checkOAuthSignIn`), açık oturumdaki BAŞKA kullanıcıya bağlanma `oauthCallbackGuard` ile engellenir.
 *
 * E-postayla mevcut hesaba bağlama (hesabı önceden açma saldırısı — saldırgan kurbanın e-postasıyla şifreli hesap açıp
 * oturum/30 günlük mobil belirteç alır, kurban sonra Google ile girer):
 *  1. Google Account henüz bağlı değil + aynı e-postalı User şifreli YA DA e-postası doğrulanmamış → `signIn` callback'inde
 *     (NextAuth `callbackHandler`'ın getUserByEmail + linkAccount'undan ÖNCE) hesap devralmaya hazırlanır.
 *  2. Tek transaction: `password = null`, `tokenVersion + 1`, `emailVerified = emailVerified ?? now` (tokenVersion
 *     eşleşmesiyle iyimser kilit); ardından `invalidateSessionVersion` → eski web/mobil oturumlar hemen düşer.
 *  3. Önceden doğrulanmamışsa kayıt bonusu `grantVerifiedSignupBonus` ile bir kez; `events.linkAccount` aynı fonksiyonu
 *     çağırır ama artık iş kalmadığı için no-op (çifte bonus / çifte sürüm artışı yok).
 *  4. `callbackHandler` kullanıcıyı bu güncellemeden SONRA okur → yeni Google oturumu güncel tokenVersion'ı taşır.
 *  5. Zaten bağlı Account, şifresiz + doğrulanmış hesap ve yeni kullanıcı: dokunulmaz. Doğrulanmış şifreli meşru
 *     kullanıcının şifresi de silinir ve diğer oturumları düşer (kabul edilen bedel; "şifremi unuttum" ile yeni şifre).
 */
import type { Provider } from 'next-auth/providers/index';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';
import { grantVerifiedSignupBonus } from '@/lib/credits';
import { canonicalEmail } from '@/lib/emailNormalize';
import { isGoogleAuthEnabled } from '@/lib/oauthEnv';
import { invalidateSessionVersion } from '@/lib/sessionVersion';

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
 * Google hesabı `userId`'ye bağlanacak / bağlandı: şifre biri tarafından (e-postanın sahibi olmayan) konmuş olabilir ya
 * da e-posta bizde doğrulanmamış → şifre silinir, e-posta doğrulanmış işaretlenir ve `tokenVersion` artırılarak o
 * şifreyle açılmış TÜM oturumlar (web çerezi + mobil belirteç) geçersiz kılınır. Şifresiz + doğrulanmış hesapta no-op.
 * Doğrulanmamıştı ise kayıt bonusu (bir kez; `grantVerifiedSignupBonus` idempotent). Değişiklik yaptıysa true.
 */
export async function secureAccountForOAuthLink(userId: string): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({
      where: { id: userId },
      select: { password: true, emailVerified: true, tokenVersion: true },
    });
    if (!row || (row.password == null && row.emailVerified != null)) return null;
    // tokenVersion eşleşmesi: eşzamanlı ikinci bir Google dönüşü sürümü bir kez daha artırmasın.
    const { count } = await tx.user.updateMany({
      where: { id: userId, tokenVersion: row.tokenVersion },
      data: { password: null, tokenVersion: { increment: 1 }, emailVerified: row.emailVerified ?? new Date() },
    });
    return count > 0 ? { wasUnverified: row.emailVerified == null } : null;
  });
  if (!result) return false;
  await invalidateSessionVersion(userId); // önbellekteki eski sürüm hemen düşsün
  // E-posta bu bağlamayla doğrulandı → kayıt bonusu (bir kez; 5 kredi almış eski hesaplara yok).
  if (result.wasUnverified) await grantVerifiedSignupBonus(userId);
  return true;
}

/**
 * NextAuth `signIn` callback'inin bağlama hazırlığı (bkz. dosya başı 1–4). `callbackHandler`'dan ÖNCE çalışır: Google
 * hesabı henüz bağlı değilse ve aynı e-postalı (NextAuth `getUserByEmail` ile aynı arama) kullanıcı varsa onu
 * `secureAccountForOAuthLink` ile temizler. Bağlı hesapla normal giriş ya da yeni kullanıcıda hiçbir şey yapmaz.
 */
export async function prepareOAuthEmailLink(
  provider: string,
  providerAccountId: string,
  email: string | null | undefined,
): Promise<void> {
  if (!email) return;
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  });
  if (linked) return;
  const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  if (target) await secureAccountForOAuthLink(target.id);
}

/**
 * NextAuth `events.linkAccount`: Google hesabı bir kullanıcıya bağlandı. Normalde `signIn`'deki hazırlık (ya da yeni
 * kullanıcıda `onOAuthUserCreated`) işi bitirmiştir → no-op. Hazırlıktan kaçan bir durum olursa yine güvenli tarafta
 * kalır (şifre silinir, oturumlar düşer; bu durumda yeni oturum da bir kez yeniden giriş ister).
 */
export async function onOAuthAccountLinked(userId: string): Promise<void> {
  await secureAccountForOAuthLink(userId);
}

/**
 * NextAuth `events.createUser`: adapter yalnızca OAuth ilk girişinde kullanıcı oluşturur (şifreli kayıt
 * `createUserAccount` ile doğrudan Prisma'ya yazar); e-postayla mevcut hesaba bağlamada da çağrılır, orada no-op.
 * `signIn` callback'i e-postanın Google'da doğrulandığını garanti ettiği için `emailVerified` işaretlenir;
 * kayıt bonusu (kredi modeli v2: 2 kredi, bir kez) doğrulanmış e-postaya verilir.
 */
export async function onOAuthUserCreated(userId: string): Promise<void> {
  // NextAuth bu olayı e-postayla MEVCUT hesaba bağlarken de çağırıyor → yalnızca az önce oluşmuş, şifresiz ve e-postası
  // henüz işaretlenmemiş kayıt "yeni"dir (adapter `emailVerified: null` ile oluşturur; e-postayla bağlanan mevcut hesabı
  // `signIn`'deki `prepareOAuthEmailLink` zaten doğrulanmış işaretler ve şifresini siler — burada krediye dokunulmamalı).
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, emailVerified: true, createdAt: true, email: true },
  });
  if (!row || row.password || row.emailVerified || Date.now() - row.createdAt.getTime() > FRESH_USER_MS) return;
  // Adapter kullanıcıyı DB varsayılanıyla oluşturur (migration B'ye kadar 5) → v2'de 0'dan başlar, bonus 2.
  const data = { emailVerified: new Date(), credits: 0 };
  try {
    await prisma.user.update({ where: { id: userId }, data: { ...data, emailNormalized: canonicalEmail(row.email) } });
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== 'P2002') throw err;
    // Aynı posta kutusunda başka hesap var (eşzamanlı kayıt; `isDuplicateMailboxOAuthSignup`'tan kaçan) → bonus yok.
    await prisma.user.update({ where: { id: userId }, data });
    return;
  }
  await grantVerifiedSignupBonus(userId);
}

/** Giriş sayfasına özel hata kodu: bu posta kutusuyla (gmail `+` / nokta varyantı) başka bir hesap kayıtlı. */
export const EMAIL_ALREADY_REGISTERED = 'EmailAlreadyRegistered';

/**
 * OAuth girişi YENİ bir kullanıcı oluşturacak ve aynı posta kutusunda (kanonik e-posta) başka hesap varsa true —
 * ikinci hesap / ikinci kayıt bonusu engellenir. Bağlı OAuth hesabı ya da tam e-posta eşleşmesi (NextAuth'un normal
 * bağlama / giriş yolu) etkilenmez.
 */
export async function isDuplicateMailboxOAuthSignup(
  provider: string,
  providerAccountId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  });
  if (linked) return false;
  const lower = email.trim().toLowerCase();
  const exact = await prisma.user.findUnique({ where: { email: lower }, select: { id: true } });
  if (exact) return false;
  const canonical = canonicalEmail(lower);
  const dup = await prisma.user.findFirst({
    where: { OR: [{ emailNormalized: canonical }, { email: canonical }] },
    select: { id: true },
  });
  return dup !== null;
}

/** OAuth ile oluşturulan kaydın "yeni" sayıldığı süre (createUser olayı oluşturmanın hemen ardından gelir). */
const FRESH_USER_MS = 5 * 60 * 1000;
