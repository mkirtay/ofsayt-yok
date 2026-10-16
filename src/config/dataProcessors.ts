/**
 * Kişisel veri aktarılan hizmet sağlayıcılar (veri işleyenler / alıcılar) — Gizlilik Politikası §5 ve KVKK Aydınlatma
 * Metni §6'daki tablo (legal.json `"table": "dataProcessors"`). Satırlar KODDAN çıkarıldı (2026-10-16 taraması); yeni bir
 * sağlayıcı eklenir ya da gönderilen veri değişirse burası da güncellenir. Kanıtlar:
 * - Hikie: config/paymentPackages.ts checkoutUrl (yalnız merchantOrderId), server/payments/paymentOrders.ts webhook kaydı.
 * - Resend: lib/security.ts sendViaResend; server/payments/orderConfirmationEmail.ts.
 * - OpenAI (asistan): pages/api/assistant/chat.ts, server/assistant/chat.ts — kullanıcı kimliği / e-posta gönderilmez.
 * - OpenAI / Anthropic (analiz, trivia): services/aiAnalysisService.ts, aiTriviaService.ts — yalnız maç verisi.
 * - Supabase: Prisma veritabanı. Upstash: lib/rateLimit.ts, loginRateLimit.ts, sessionVersion.ts, assistant/quota.ts.
 * - Cloudflare Turnstile: lib/security.ts verifyTurnstileToken (remoteip). Sentry: sentry.*.config.ts (sendDefaultPii
 *   false + lib/sentryScrub.ts). Vercel: barındırma + Web Analytics (lib/analyticsScrub.ts). Google: lib/oauth.ts.
 * Kapsam dışı (kişisel veri almaz): Sportmonks (sunucudan yalnız maç / takım kimliği), X botu, Expo (gönderim kodu yok).
 */
import type { LegalTable } from '@/components/LegalPage';

type Row = { provider: string; tr: [string, string]; en: [string, string] };

const ROWS: Row[] = [
  {
    provider: 'Hikie',
    tr: ['Ödeme sayfasına yalnız sipariş numarası iletilir; kart ve iletişim bilgilerini kullanıcı doğrudan Hikie\'ye girer. Hikie\'den ödeme sonucu, tutar, para birimi ve işlem numarası alınır.', 'Kredi satın alma ödemesi'],
    en: ['Only the order number is passed to the payment page; the user enters card and contact details directly at Hikie. We receive the payment result, amount, currency and transaction number.', 'Payment for credit purchases'],
  },
  {
    provider: 'Resend',
    tr: ['E-posta adresi ve e-posta içeriği (doğrulama / şifre sıfırlama bağlantısı, hesap silme bildirimi, sipariş özeti).', 'İşlem e-postalarının gönderimi'],
    en: ['E-mail address and message content (verification / password reset link, account deletion notice, order summary).', 'Sending transactional e-mails'],
  },
  {
    provider: 'OpenAI',
    tr: ['AI asistanına yazdığınız mesajlar (son birkaç mesaj) ve bulunduğunuz sayfanın yolu. Ad, e-posta, kullanıcı kimliği veya IP adresi gönderilmez.', 'AI asistanı yanıtları'],
    en: ['Messages you type to the AI assistant (the last few) and the path of the current page. No name, e-mail, user id or IP address is sent.', 'AI assistant replies'],
  },
  {
    provider: 'OpenAI / Anthropic',
    tr: ['Yalnız maç ve istatistik verisi; kullanıcıya ait veri gönderilmez.', 'AI maç analizi ve trivia üretimi'],
    en: ['Match and statistics data only; no user data is sent.', 'Generating AI match analyses and trivia'],
  },
  {
    provider: 'Supabase',
    tr: ['Veritabanındaki tüm hesap ve kullanım verileri (hesap, kredi hareketleri, siparişler, gönderiler, tercihler).', 'Veritabanı barındırma'],
    en: ['All account and usage data in the database (account, credit history, orders, posts, preferences).', 'Database hosting'],
  },
  {
    provider: 'Vercel',
    tr: ['Siteye yapılan istekler (IP adresi, adres, tarayıcı bilgisi) sunucu kayıtlarında; çerezsiz sayfa istatistiği için sayfa adresi (e-posta, belirteç gibi parametreler silinerek).', 'Barındırma, sunucu kayıtları, sayfa istatistiği'],
    en: ['Requests to the site (IP address, URL, browser details) in server logs; the page address for cookieless page statistics (with parameters such as e-mail or tokens removed).', 'Hosting, server logs, page statistics'],
  },
  {
    provider: 'Upstash',
    tr: ['Hız sınırlama ve oturum anahtarları: IP adresi, kullanıcı kimliği, giriş denemesinde e-posta / kullanıcı adı; üye olmayan asistan kullanımında IP adresinin tuzlanmış özeti. Anahtarlar süre dolunca silinir.', 'Kötüye kullanımı önleme, oturum güvenliği, kota'],
    en: ['Rate-limit and session keys: IP address, user id, e-mail / username on login attempts; a salted hash of the IP address for guest assistant use. Keys expire automatically.', 'Abuse prevention, session security, quotas'],
  },
  {
    provider: 'Cloudflare (Turnstile)',
    tr: ['Kayıt sırasında bot doğrulama belirteci ve IP adresi; tarayıcı doğrulama betiğini Cloudflare\'den yükler.', 'Kayıtta bot koruması'],
    en: ['Bot-check token and IP address at signup; the browser loads the check script from Cloudflare.', 'Bot protection at signup'],
  },
  {
    provider: 'Sentry',
    tr: ['Hata mesajı, hatanın oluştuğu sayfa, tarayıcı / işletim sistemi türü. Ad, e-posta, çerez ve adresteki belirteç / e-posta parametreleri gönderilmez; IP adresi saklanmaz.', 'Hata izleme'],
    en: ['Error message, page where it happened, browser / OS type. No name, e-mail, cookies or token / e-mail URL parameters are sent; the IP address is not stored.', 'Error tracking'],
  },
  {
    provider: 'Google',
    tr: ['Google ile giriş seçildiğinde Google\'dan ad, e-posta ve profil fotoğrafı adresi alınır; profil fotoğrafı ziyaretçinin tarayıcısında Google\'dan yüklenir.', 'Google ile giriş'],
    en: ['If you sign in with Google, we receive your name, e-mail and profile picture URL from Google; the picture is loaded from Google in the visitor\'s browser.', 'Sign in with Google'],
  },
];

export function dataProcessorTable(locale: 'tr' | 'en'): LegalTable {
  const en = locale === 'en';
  return {
    head: en ? ['Provider', 'Data shared', 'Purpose'] : ['Sağlayıcı', 'Paylaşılan veri', 'Amaç'],
    rows: ROWS.map((r) => [r.provider, ...(en ? r.en : r.tr)]),
  };
}

/** Testler için: tablodaki sağlayıcı adları. */
export const DATA_PROCESSOR_NAMES = ROWS.map((r) => r.provider);
