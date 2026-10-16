import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { grantVerifiedSignupBonus } from '@/lib/credits';
import { BRAND } from '@/config/brand';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileResponse = {
  success: boolean;
};

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return false;
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) return false;

  const data = (await response.json()) as TurnstileResponse;
  return data.success === true;
}

export type SignupTurnstileResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Turnstile kapısı (kayıt ve herkese açık formlar: hesap silme talebi). Üretimde zorunlu: `TURNSTILE_SECRET_KEY` yoksa
 * istek REDDEDİLİR (önceden sessizce atlanıyordu — ortam değişkeni düşerse bot kaydı açık kalırdı). Geliştirme / testte
 * atlanır. `unavailableError`: anahtar yokken dönen 503 metni.
 */
export async function checkTurnstileGate(
  token: unknown,
  remoteIp: string | undefined,
  opts: { unavailableError: string; env?: { NODE_ENV?: string; TURNSTILE_SECRET_KEY?: string } },
): Promise<SignupTurnstileResult> {
  const env = opts.env ?? process.env;
  if (env.NODE_ENV !== 'production') return { ok: true };
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('[turnstile] TURNSTILE_SECRET_KEY tanımlı değil — istek reddedildi.');
    return { ok: false, status: 503, error: opts.unavailableError };
  }
  if (typeof token !== 'string' || !token) {
    return { ok: false, status: 400, error: 'Güvenlik doğrulaması başarısız.' };
  }
  const ok = await verifyTurnstileToken(token, remoteIp).catch(() => false);
  return ok ? { ok: true } : { ok: false, status: 400, error: 'Güvenlik doğrulaması başarısız.' };
}

/** Kayıt uçlarının (web + mobil) Turnstile kapısı (bkz. `checkTurnstileGate`). */
export async function checkSignupTurnstile(
  token: unknown,
  remoteIp: string | undefined,
  env: { NODE_ENV?: string; TURNSTILE_SECRET_KEY?: string } = process.env,
): Promise<SignupTurnstileResult> {
  return checkTurnstileGate(token, remoteIp, {
    unavailableError: 'Kayıt şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin.',
    env,
  });
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function appBaseUrl(): string {
  return (process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function normalizeEmailFrom(raw: string | undefined): string {
  if (!raw) return '';
  let from = raw.trim();
  if (
    (from.startsWith('"') && from.endsWith('"')) ||
    (from.startsWith("'") && from.endsWith("'"))
  ) {
    from = from.slice(1, -1).trim();
  }
  return from;
}

/**
 * Yanıtlar gönderen adresine (EMAIL_FROM, ör. noreply@) değil iletişim kutusuna gider: `BRAND.contactEmail`
 * (info@getscor3.com). Gönderen adresi env'den (EMAIL_FROM) gelmeye devam eder.
 */
export const EMAIL_REPLY_TO = BRAND.contactEmail;

export type EmailContent = { subject: string; html: string; text: string };

export type EmailLocale = 'tr' | 'en';

/** İstemciden gelen dil (`locale`) → e-posta dili; bilinmeyen değer Türkçe. */
export function emailLocale(raw: unknown): EmailLocale {
  return raw === 'en' ? 'en' : 'tr';
}

/** HTML gövdesi: UTF-8 bildiren küçük belge (bazı istemciler `<meta charset>` olmadan Türkçe karakteri bozuyor). */
function emailHtml(body: string, lang: EmailLocale = 'tr'): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`;
}

/** Doğrulama e-postası (konu + HTML + düz metin). Marka adı `BRAND.name`. */
export function verificationEmail(link: string): EmailContent {
  return {
    subject: `${BRAND.name} - E-posta Doğrulama`,
    html: emailHtml(
      `<p>Merhaba,</p><p>Hesabınızı aktif etmek için aşağıdaki bağlantıya tıklayın:</p><p><a href="${link}">${link}</a></p><p>Bu bağlantı 24 saat geçerlidir.</p>`,
    ),
    text: `Merhaba,\n\nHesabınızı aktif etmek için aşağıdaki bağlantıya tıklayın:\n${link}\n\nBu bağlantı 24 saat geçerlidir.\n`,
  };
}

/** Şifre sıfırlama e-postası (konu + HTML + düz metin). */
export function passwordResetEmail(link: string): EmailContent {
  return {
    subject: `${BRAND.name} - Şifre Sıfırlama`,
    html: emailHtml(
      `<p>Merhaba,</p><p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p><p><a href="${link}">${link}</a></p><p>Bu bağlantı <strong>1 saat</strong> geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yoksayabilirsiniz.</p>`,
    ),
    text: `Merhaba,\n\nŞifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:\n${link}\n\nBu bağlantı 1 saat geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yoksayabilirsiniz.\n`,
  };
}

/**
 * Hesap silindi onayı (konu + HTML + düz metin; TR / EN). Gövdede kişisel veri yok (ad, kullanıcı adı, kimlik);
 * yalnızca alıcı adresine gider. Silmeyi kendisi yapmadıysa iletişim adresine yazması istenir.
 */
export function accountDeletedEmail(locale: EmailLocale = 'tr'): EmailContent {
  const contact = BRAND.contactEmail;
  if (locale === 'en') {
    const body = `Your ${BRAND.name} account has been deleted at your request. Your sessions were signed out; your profile, favourites, credit balance and unlocked analyses were deleted. Your Gündem posts and comments remain anonymously under the name "Deleted user".`;
    return {
      subject: `${BRAND.name} - Your account has been deleted`,
      html: emailHtml(
        `<p>Hello,</p><p>${body}</p><p>If you did not do this, write to <a href="mailto:${contact}">${contact}</a>.</p>`,
        'en',
      ),
      text: `Hello,\n\n${body}\n\nIf you did not do this, write to ${contact}.\n`,
    };
  }
  return {
    subject: `${BRAND.name} - Hesabınız silindi`,
    html: emailHtml(
      `<p>Merhaba,</p><p>${BRAND.name} hesabınız isteğiniz üzerine silindi. Oturumlarınız kapatıldı; profiliniz, favorileriniz, kredi bakiyeniz ve açtığınız analizler silindi. Gündem'deki gönderi ve yorumlarınız "Silinmiş kullanıcı" adıyla anonim olarak kalır.</p><p>Bu işlemi siz yapmadıysanız <a href="mailto:${contact}">${contact}</a> adresine yazın.</p>`,
    ),
    text: `Merhaba,\n\n${BRAND.name} hesabınız isteğiniz üzerine silindi. Oturumlarınız kapatıldı; profiliniz, favorileriniz, kredi bakiyeniz ve açtığınız analizler silindi. Gündem'deki gönderi ve yorumlarınız "Silinmiş kullanıcı" adıyla anonim olarak kalır.\n\nBu işlemi siz yapmadıysanız ${contact} adresine yazın.\n`,
  };
}

/**
 * Hesap silme talebi onay bağlantısı (/hesap-silme formu; TR / EN). Konu ve gövdede "siz istemediyseniz yok sayın"
 * uyarısı; bağlantı yalnız onay sayfasını açar, silme o sayfadaki düğmeyle olur. Kişisel veri yok.
 */
export function accountDeletionRequestEmail(link: string, locale: EmailLocale = 'tr'): EmailContent {
  if (locale === 'en') {
    return {
      subject: `${BRAND.name} - Confirm account deletion (ignore if you did not request this)`,
      html: emailHtml(
        `<p>Hello,</p><p>We received a request to delete your ${BRAND.name} account. To continue, open the link below and press the <strong>Delete my account</strong> button on that page:</p><p><a href="${link}">${link}</a></p><p>This link is valid for <strong>1 hour</strong> and can be used once. Opening the link alone does not delete anything.</p><p><strong>If you did not make this request, ignore this email</strong> — your account stays as it is.</p>`,
        'en',
      ),
      text: `Hello,\n\nWe received a request to delete your ${BRAND.name} account. To continue, open the link below and press the "Delete my account" button on that page:\n${link}\n\nThis link is valid for 1 hour and can be used once. Opening the link alone does not delete anything.\n\nIf you did not make this request, ignore this email — your account stays as it is.\n`,
    };
  }
  return {
    subject: `${BRAND.name} - Hesap silme onayı (siz istemediyseniz yok sayın)`,
    html: emailHtml(
      `<p>Merhaba,</p><p>${BRAND.name} hesabınızın silinmesi için bir talep aldık. Devam etmek için aşağıdaki bağlantıyı açın ve sayfadaki <strong>Hesabımı sil</strong> düğmesine basın:</p><p><a href="${link}">${link}</a></p><p>Bu bağlantı <strong>1 saat</strong> geçerlidir ve bir kez kullanılabilir. Yalnızca bağlantıyı açmak hiçbir şeyi silmez.</p><p><strong>Bu isteği siz yapmadıysanız bu e-postayı yok sayın</strong> — hesabınız olduğu gibi kalır.</p>`,
    ),
    text: `Merhaba,\n\n${BRAND.name} hesabınızın silinmesi için bir talep aldık. Devam etmek için aşağıdaki bağlantıyı açın ve sayfadaki "Hesabımı sil" düğmesine basın:\n${link}\n\nBu bağlantı 1 saat geçerlidir ve bir kez kullanılabilir. Yalnızca bağlantıyı açmak hiçbir şeyi silmez.\n\nBu isteği siz yapmadıysanız bu e-postayı yok sayın — hesabınız olduğu gibi kalır.\n`,
  };
}

/**
 * Yönetici şikâyet özeti (toplu: lib/moderation/adminAlert.ts en fazla 30 dakikada bir). Kişisel veri yok: yalnız açık
 * şikâyetli içerik sayısı ve kuyruk bağlantısı (şikâyet eden / edilen, içerik metni e-postaya yazılmaz).
 */
export function moderationAlertEmail(openTargets: number, link: string, reviewHours: number): EmailContent {
  return {
    subject: `${BRAND.name} - Gündem: ${openTargets} açık şikâyet`,
    html: emailHtml(
      `<p>Merhaba,</p><p>Gündem'de incelenmeyi bekleyen <strong>${openTargets}</strong> içerik var. Topluluk kurallarında şikâyetlere en geç ${reviewHours} saatte bakma taahhüdü var.</p><p><a href="${link}">${link}</a></p>`,
    ),
    text: `Merhaba,\n\nGündem'de incelenmeyi bekleyen ${openTargets} içerik var. Topluluk kurallarında şikâyetlere en geç ${reviewHours} saatte bakma taahhüdü var.\n${link}\n`,
  };
}

/** Yönetici şikâyet özeti; gönderilemezse false (şikâyet kaydı etkilenmez). Adres loglanmaz. */
export async function sendModerationAlertEmail(to: string, content: EmailContent): Promise<boolean> {
  try {
    return await sendViaResend(to, content);
  } catch {
    console.warn('[moderation] Yönetici özet e-postası gönderilemedi (ağ hatası).');
    return false;
  }
}

/**
 * Resend HTTP API: gövde JSON (UTF-8); konu ve gövdedeki Türkçe karakterleri MIME'a (konu başlığı RFC 2047, gövde
 * `charset=utf-8`) Resend kodlar. `text` düz metin alternatifi (multipart/alternative).
 */
async function sendViaResend(to: string, { subject, html, text }: EmailContent): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = normalizeEmailFrom(process.env.EMAIL_FROM);
  if (!apiKey || !from) {
    console.warn('[resend] RESEND_API_KEY veya EMAIL_FROM eksik');
    return false;
  }
  if (!from.includes('@')) {
    console.warn(
      `[resend] EMAIL_FROM gecersiz (e-posta yok). Ornek: ${BRAND.name} <noreply@${BRAND.domain}>`,
    );
    return false;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ from, to, reply_to: EMAIL_REPLY_TO, subject, html, text }),
  });

  if (!response.ok) {
    // Gövde loglanır ama kısaltılır (Resend hata gövdesi gönderilen içeriği yansıtmaz; yine de sınırla).
    const body = await response.text().catch(() => '');
    console.error(`[resend] HTTP ${response.status}:`, body.slice(0, 300));
  }

  return response.ok;
}

/** Hesap silme onayı; gönderilemezse false (silme geri alınmaz). Adres loglanmaz. */
export async function sendAccountDeletedEmail(email: string, locale: EmailLocale = 'tr'): Promise<boolean> {
  try {
    const sent = await sendViaResend(email, accountDeletedEmail(locale));
    if (!sent) console.warn('[account-delete] Onay e-postası gönderilemedi (sağlayıcı yapılandırılmamış ya da hata).');
    return sent;
  } catch {
    console.warn('[account-delete] Onay e-postası gönderilemedi (ağ hatası).');
    return false;
  }
}

/** Hesap silme talebi bağlantısı; gönderilemezse false. Adres ve bağlantı (tek kullanımlık belirteç) loglanmaz. */
export async function sendAccountDeletionRequestEmail(email: string, link: string, locale: EmailLocale = 'tr'): Promise<boolean> {
  try {
    const sent = await sendViaResend(email, accountDeletionRequestEmail(link, locale));
    if (!sent) console.warn('[account-delete-request] Onay bağlantısı gönderilemedi (sağlayıcı yapılandırılmamış ya da hata).');
    return sent;
  } catch {
    console.warn('[account-delete-request] Onay bağlantısı gönderilemedi (ağ hatası).');
    return false;
  }
}

export async function createAndSendEmailVerification(email: string): Promise<void> {
  const rawToken = randomBytes(32).toString('hex');
  const hashedToken = sha256(rawToken);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashedToken,
      expires,
    },
  });

  const link = `${appBaseUrl()}/api/auth/verify-email?token=${rawToken}`;
  const sent = await sendViaResend(email, verificationEmail(link));

  if (!sent) {
    // Bağlantı (tek kullanımlık belirteç) loglanmaz: log erişimi hesap ele geçirmeye dönüşmesin.
    console.warn('[verify-email] Doğrulama e-postası gönderilemedi (sağlayıcı yapılandırılmamış ya da hata).');
  }
}

export async function consumeEmailVerificationToken(rawToken: string): Promise<boolean> {
  const hashedToken = sha256(rawToken);
  const tokenRow = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  });

  if (!tokenRow) return false;
  if (tokenRow.expires <= new Date()) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } });
    return false;
  }

  const user = await prisma.user.update({
    where: { email: tokenRow.identifier },
    data: { emailVerified: new Date() },
    select: { id: true },
  });

  await prisma.verificationToken.delete({ where: { token: hashedToken } });
  // Kredi modeli v2: kayıt bonusu yalnız doğrulanmış e-postaya (bir kez; tekrar doğrulamada no-op).
  await grantVerifiedSignupBonus(user.id);
  return true;
}

const RESET_PREFIX = 'reset:';

export async function createAndSendPasswordReset(email: string): Promise<void> {
  await prisma.verificationToken.deleteMany({
    where: { identifier: `${RESET_PREFIX}${email}` },
  });

  const rawToken = randomBytes(32).toString('hex');
  const hashedToken = sha256(rawToken);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

  await prisma.verificationToken.create({
    data: { identifier: `${RESET_PREFIX}${email}`, token: hashedToken, expires },
  });

  const link = `${appBaseUrl()}/auth/reset-password?token=${rawToken}`;
  const sent = await sendViaResend(email, passwordResetEmail(link));

  if (!sent) {
    // Bağlantı (tek kullanımlık belirteç) loglanmaz: log erişimi hesap ele geçirmeye dönüşmesin.
    console.warn('[password-reset] Sıfırlama e-postası gönderilemedi (sağlayıcı yapılandırılmamış ya da hata).');
  }
}

export async function consumePasswordResetToken(rawToken: string): Promise<string | null> {
  const hashedToken = sha256(rawToken);
  const tokenRow = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  });

  if (!tokenRow) return null;
  if (!tokenRow.identifier.startsWith(RESET_PREFIX)) return null;
  if (tokenRow.expires <= new Date()) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } });
    return null;
  }

  const email = tokenRow.identifier.slice(RESET_PREFIX.length);
  await prisma.verificationToken.delete({ where: { token: hashedToken } });
  return email;
}

export type SanitizePlainTextOptions = {
  /**
   * `\n` (satır sonu) korunur: CRLF/CR → `\n`, ardışık 3+ boş satır 2'ye iner. Diğer kontrol karakterleri yine silinir.
   * Varsayılan (kapalı): tüm kontrol karakterleri (satır sonu dahil) silinir — maç yorumları bu davranışta kalır.
   */
  allowNewlines?: boolean;
  /**
   * Ham girdi için sert üst sınır (karakter). Aşılırsa HİÇBİR işlem yapılmadan `PlainTextTooLongError` fırlatılır.
   * Çağıran uç bunu (ya da `input.length`'i önceden kendisi kontrol edip) 400'e çevirir.
   */
  maxInputLength?: number;
};

/** `sanitizePlainText` ham girdisi `maxInputLength`'i aştı (temizleme çalıştırılmadı). */
export class PlainTextTooLongError extends Error {
  constructor(
    readonly length: number,
    readonly max: number,
  ) {
    super(`Girdi çok uzun (${length} > ${max}).`);
    this.name = 'PlainTextTooLongError';
  }
}

/**
 * `input.replace(/<[^>]*>/g, '')` ile birebir aynı sonuç, doğrusal sürede.
 * Regex, `>` içermeyen uzun bir `<<<…` kuyruğunda her `<` için sona kadar tarayıp O(n²) oluyordu. Bir `<`'den sonra
 * hiç `>` yoksa sonraki `<`'ler de eşleşemez (onlardan sonra da `>` yok) → tarama orada biter.
 */
function stripTags(input: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const lt = input.indexOf('<', i);
    if (lt === -1) break;
    const gt = input.indexOf('>', lt + 1);
    if (gt === -1) break;
    out += input.slice(i, lt);
    i = gt + 1;
  }
  return i === 0 ? input : out + input.slice(i);
}

// Eski `s.replace(/ *\n */g, '\n')` ile birebir aynı sonuç, doğrusal sürede: yalnız bir `\n`'e değen boşluk (U+0020)
// dizileri silinir (ilk satırın başı ve son satırın sonu korunur). Regex uzun boşluk dizisinde O(n²) oluyordu.
function trimSpacesAroundNewlines(s: string): string {
  if (!s.includes('\n')) return s;
  const lines = s.split('\n');
  const last = lines.length - 1;
  for (let k = 0; k <= last; k += 1) {
    const line = lines[k]!;
    let start = 0;
    let end = line.length;
    if (k > 0) while (start < end && line.charCodeAt(start) === 32) start += 1;
    if (k < last) while (end > start && line.charCodeAt(end - 1) === 32) end -= 1;
    if (start !== 0 || end !== line.length) lines[k] = line.slice(start, end);
  }
  return lines.join('\n');
}

export function sanitizePlainText(input: string, options?: SanitizePlainTextOptions): string {
  // Uzunluk kontrolü temizlemeden ÖNCE: büyük gövde CPU harcatmadan reddedilir.
  if (options?.maxInputLength !== undefined && input.length > options.maxInputLength) {
    throw new PlainTextTooLongError(input.length, options.maxInputLength);
  }
  const noTags = stripTags(input);
  if (!options?.allowNewlines) {
    return noTags.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  }
  return trimSpacesAroundNewlines(
    noTags.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ''),
  ) // satır kenarı boşlukları: "\n \n \n" da boş satır sayılır
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isSafeHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
