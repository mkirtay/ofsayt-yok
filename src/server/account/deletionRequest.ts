/**
 * Giriş yapmadan hesap silme talebi (Google Play "hesap silme URL'si": /hesap-silme). Silme mantığı çoğaltılmaz:
 * onaydan sonra `deleteOwnAccount` (server/account/deleteAccount.ts) çağrılır.
 *
 * Akış:
 *  1. `requestAccountDeletion(email)`: hesap varsa ve silinebilirse (yönetici / resmi Gündem hesabı / yer tutucu değil)
 *     tek kullanımlık rastgele belirteç üretilir, veritabanına yalnız SHA-256 özeti yazılır (`VerificationToken`,
 *     identifier `account-delete:<userId>` — e-posta tutulmaz), 1 saat geçerli, kullanıcı başına tek geçerli bağlantı.
 *     Bağlantı e-posta adresine gider. Hesap yoksa / korunuyorsa hiçbir şey yapılmaz. Çağıran (API ucu) bu işi yanıttan
 *     SONRA arka planda çalıştırır → yanıt ve süre hesap var/yok ayrımını göstermez.
 *  2. Bağlantı onay sayfasını açar (`/hesap-silme/onay#token=…`; parça sunucuya / günlüklere gitmez). Sayfayı açmak
 *     hiçbir şey silmez: `checkAccountDeletionToken` yalnız geçerlilik söyler.
 *  3. `confirmAccountDeletion(token)`: sayfadaki düğme (POST). Belirteç atomik olarak tüketilir (aynı anda iki istek
 *     gelirse yalnız biri siler), ardından `deleteOwnAccount`. Silme hatasında belirteç geri gelmez — kullanıcı yeni
 *     bağlantı ister.
 */
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { canonicalEmail } from '@/lib/emailNormalize';
import { isOfficialUser } from '@/lib/gundem/official';
import { DELETE_CONFIRM_WORD } from '@/lib/accountDeletion';
import { appBaseUrl, sendAccountDeletedEmail, sendAccountDeletionRequestEmail, sha256, type EmailLocale } from '@/lib/security';
import { isDeletedUserId } from '@/config/deletedUser';
import { deleteOwnAccount, type DeletionCounts } from '@/server/account/deleteAccount';

export const DELETION_TOKEN_PREFIX = 'account-delete:';
export const DELETION_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 saat
/** Onay sayfası (belirteç URL parçasında: `#token=`). */
export const DELETION_CONFIRM_PATH = '/hesap-silme/onay';

export const deletionTokenIdentifier = (userId: string) => `${DELETION_TOKEN_PREFIX}${userId}`;

/** Ham belirteç biçimi: 32 bayt onaltılık (64 karakter). Başka bir şey veritabanına hiç sorulmaz. */
const TOKEN_RE = /^[0-9a-f]{64}$/;
export function isWellFormedDeletionToken(raw: unknown): raw is string {
  return typeof raw === 'string' && TOKEN_RE.test(raw);
}

/** Basit biçim kontrolü (form doğrulaması değil): tek "@", iki yanı dolu, 254 karakteri aşmayan. */
export function isPlausibleEmail(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const e = raw.trim();
  if (e.length < 3 || e.length > 254) return false;
  const at = e.indexOf('@');
  return at > 0 && at === e.lastIndexOf('@') && at < e.length - 1 && !/\s/.test(e);
}

export type DeletionRequestOutcome = 'sent' | 'send_failed' | 'no_account' | 'protected';

type Deps = {
  sendRequestEmail?: (email: string, link: string, locale: EmailLocale) => Promise<boolean>;
  now?: () => number;
};

/**
 * Talep: hesap varsa onay bağlantısı gönderir. Dönen sonuç YALNIZ testler / iç sayaç içindir; API yanıtına yansımaz.
 * E-posta ve belirteç loglanmaz.
 */
export async function requestAccountDeletion(
  rawEmail: string,
  locale: EmailLocale,
  deps: Deps = {},
): Promise<DeletionRequestOutcome> {
  const typed = rawEmail.trim().toLowerCase();
  const select = { id: true, email: true, role: true } as const;
  // Kayıtlı adres birebir; yoksa kanonik biçim (Gmail noktaları, +etiket). Bağlantı her zaman KAYITLI adrese gider.
  const user =
    (await prisma.user.findUnique({ where: { email: typed }, select })) ??
    (await prisma.user.findUnique({ where: { emailNormalized: canonicalEmail(typed) }, select }));
  if (!user) return 'no_account';
  if (isDeletedUserId(user.id) || user.role === 'ADMIN' || isOfficialUser({ email: user.email })) return 'protected';

  const now = deps.now?.() ?? Date.now();
  const rawToken = randomBytes(32).toString('hex');
  const identifier = deletionTokenIdentifier(user.id);
  // Kullanıcı başına tek geçerli bağlantı: yenisi eskileri geçersiz kılar.
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: { identifier, token: sha256(rawToken), expires: new Date(now + DELETION_TOKEN_TTL_MS) },
    }),
  ]);

  const link = `${appBaseUrl()}${DELETION_CONFIRM_PATH}#token=${rawToken}`;
  const sent = await (deps.sendRequestEmail ?? sendAccountDeletionRequestEmail)(user.email, link, locale);
  return sent ? 'sent' : 'send_failed';
}

/** Geçerli (var, süresi dolmamış, silme belirteci) satırın kullanıcı kimliği; değilse null. Yan etkisi yok. */
async function findValidToken(rawToken: string, now: number): Promise<{ hashed: string; userId: string } | null> {
  if (!isWellFormedDeletionToken(rawToken)) return null;
  const hashed = sha256(rawToken);
  const row = await prisma.verificationToken.findUnique({ where: { token: hashed } });
  if (!row || !row.identifier.startsWith(DELETION_TOKEN_PREFIX) || row.expires.getTime() <= now) return null;
  return { hashed, userId: row.identifier.slice(DELETION_TOKEN_PREFIX.length) };
}

/** Onay sayfası açılınca: bağlantı geçerli mi (hiçbir şey silinmez, belirteç tüketilmez). */
export async function checkAccountDeletionToken(rawToken: unknown, deps: Deps = {}): Promise<boolean> {
  if (!isWellFormedDeletionToken(rawToken)) return false;
  return (await findValidToken(rawToken, deps.now?.() ?? Date.now())) != null;
}

export type ConfirmDeletionResult =
  | { ok: true; counts: DeletionCounts; emailSent: boolean }
  | { ok: false; reason: 'INVALID_TOKEN' | 'PROTECTED_ACCOUNT' };

/**
 * Onay düğmesi: belirteci tüketir ve hesabı siler. Geçersiz / süresi dolmuş / kullanılmış belirteç ve artık var olmayan
 * hesap aynı sonucu verir (`INVALID_TOKEN`).
 */
export async function confirmAccountDeletion(
  rawToken: unknown,
  locale: EmailLocale,
  deps: Deps & { sendDeletedEmail?: (email: string) => Promise<boolean> } = {},
): Promise<ConfirmDeletionResult> {
  if (!isWellFormedDeletionToken(rawToken)) return { ok: false, reason: 'INVALID_TOKEN' };
  const now = deps.now?.() ?? Date.now();
  const valid = await findValidToken(rawToken, now);
  if (!valid) return { ok: false, reason: 'INVALID_TOKEN' };

  // Atomik tüketim: koşullu silme yalnız bir istekte 1 döner (eşzamanlı ikinci tıklama / tekrar gönderim 0 alır).
  const consumed = await prisma.verificationToken.deleteMany({
    where: { token: valid.hashed, identifier: deletionTokenIdentifier(valid.userId), expires: { gt: new Date(now) } },
  });
  if (consumed.count !== 1) return { ok: false, reason: 'INVALID_TOKEN' };

  // Açık onay = sayfadaki düğme; `deleteOwnAccount` onay kelimesini ister, aynı kural yolu kullanılır.
  const result = await deleteOwnAccount(valid.userId, {
    confirm: DELETE_CONFIRM_WORD,
    source: 'email_link',
    sendEmail: deps.sendDeletedEmail ?? ((email) => sendAccountDeletedEmail(email, locale)),
  });
  if (result.ok) return result;
  if (result.reason === 'PROTECTED_ACCOUNT') return { ok: false, reason: 'PROTECTED_ACCOUNT' };
  return { ok: false, reason: 'INVALID_TOKEN' };
}
