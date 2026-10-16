/**
 * Sipariş onay e-postası (Resend) — imzalı `order.paid` webhook'u siparişi PAID yaptıktan sonra BİR KEZ gönderilir.
 *
 * Tekillik: `PaymentOrder.confirmationEmailSentAt` koşullu güncellemeyle (yalnız null ise) talep edilir; çift webhook /
 * eşzamanlı teslimatta yalnız biri gönderir. Gönderim başarısızsa talep geri alınır (null) ve hata fırlatılır — çağıran
 * (handleHikieWebhook) Sentry'ye yazar, webhook yine 200 döner ve kredi zaten verilmiştir.
 * İçerik: sipariş no, paket, kredi, tutar (KDV dahil), tarih, satıcı bilgisi (config/seller.ts), iletişim. Dil: siparişin
 * `locale`'i (checkout anındaki site dili; yoksa tr).
 */
import { prisma } from '@/lib/prisma';
import { BRAND } from '@/config/brand';
import { SELLER, sellerLine } from '@/config/seller';
import { findPaymentPackage } from '@/config/paymentPackages';
import { formatTry } from '@/config/creditPackages';
import { emailHtml, sendTransactionalEmail, type EmailContent } from '@/lib/security';
import { siteBaseUrl } from '@/lib/siteUrl';

export type OrderEmailInput = {
  merchantOrderId: string;
  credits: number;
  amountKurus: number;
  paidAt: Date;
  locale: 'tr' | 'en';
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "39.99" / "1" (Decimal metni) → kuruş; float yok. */
export function decimalTextToKurus(text: string): number {
  const [int = '0', frac = ''] = text.trim().split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

function formatDate(d: Date, locale: 'tr' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatAmount(kurus: number, locale: 'tr' | 'en'): string {
  return locale === 'en' ? `${(kurus / 100).toFixed(2)} TRY` : formatTry(kurus);
}

/** Konu + HTML + düz metin (mevcut şablonlarla aynı sade biçim: paragraflar, bağlantı, satır). */
export function orderConfirmationEmail(input: OrderEmailInput): EmailContent {
  const en = input.locale === 'en';
  const amount = formatAmount(input.amountKurus, input.locale);
  const date = formatDate(input.paidAt, input.locale);
  const contact = BRAND.contactEmail;
  const site = siteBaseUrl();
  const rows: [string, string][] = en
    ? [
        ['Order number', input.merchantOrderId],
        ['Package', `${input.credits} AI analysis credits`],
        ['Credits added', String(input.credits)],
        ['Amount (VAT included)', amount],
        ['Date', `${date} (Turkey time)`],
      ]
    : [
        ['Sipariş numarası', input.merchantOrderId],
        ['Paket', `${input.credits} AI analiz kredisi`],
        ['Yüklenen kredi', String(input.credits)],
        ['Tutar (KDV dahil)', amount],
        ['Tarih', `${date} (TSİ)`],
      ];
  const intro = en
    ? `Thank you for your purchase. Your payment was confirmed and ${input.credits} credits were added to your ${BRAND.name} account. Credits do not expire; each AI match analysis you unlock costs 1 credit.`
    : `Satın alımınız için teşekkürler. Ödemeniz onaylandı ve ${BRAND.name} hesabınıza ${input.credits} kredi yüklendi. Krediler süresizdir; açtığınız her AI maç analizi 1 kredidir.`;
  const sellerTitle = en ? 'Seller' : 'Satıcı';
  const seller = sellerLine(input.locale, SELLER);
  const help = en
    ? `Questions about your order? Write to ${contact} with your order number.`
    : `Siparişinizle ilgili sorularınız için sipariş numaranızla ${contact} adresine yazabilirsiniz.`;
  const docs = en
    ? `Pre-contract information form and distance sales contract: ${site}/on-bilgilendirme-formu · ${site}/mesafeli-satis-sozlesmesi`
    : `Ön bilgilendirme formu ve mesafeli satış sözleşmesi: ${site}/on-bilgilendirme-formu · ${site}/mesafeli-satis-sozlesmesi`;
  const subject = en ? `${BRAND.name} - Order confirmation (${input.merchantOrderId})` : `${BRAND.name} - Sipariş onayı (${input.merchantOrderId})`;

  const tableHtml = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join('');
  const html = emailHtml(
    `<p>${en ? 'Hello,' : 'Merhaba,'}</p><p>${esc(intro)}</p><table role="presentation" style="border-collapse:collapse">${tableHtml}</table>` +
      `<p>${esc(help).replace(esc(contact), `<a href="mailto:${esc(contact)}">${esc(contact)}</a>`)}</p>` +
      `<p style="color:#555;font-size:13px">${esc(docs)}</p>` +
      `<p style="color:#555;font-size:13px">${esc(sellerTitle)}: ${esc(seller)}</p>`,
    input.locale,
  );
  const text =
    `${en ? 'Hello,' : 'Merhaba,'}\n\n${intro}\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\n${help}\n\n${docs}\n\n${sellerTitle}: ${seller}\n`;
  return { subject, html, text };
}

export type ConfirmationResult = 'sent' | 'already' | 'skipped';

/**
 * Sipariş PAID ise ve onay e-postası henüz gönderilmediyse gönderir (tek sefer). Gönderilemezse talebi geri alır ve
 * fırlatır (çağıran Sentry'ye yazar). Silinmiş / geçersiz adresli kullanıcıya gönderilmez ('skipped').
 */
export async function sendOrderConfirmationOnce(
  orderId: string,
  send: (to: string, content: EmailContent) => Promise<boolean> = sendTransactionalEmail,
): Promise<ConfirmationResult> {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PAID' || !order.paidAt) return 'skipped';
  if (order.confirmationEmailSentAt) return 'already';
  const pkg = findPaymentPackage(order.packageKey);
  const user = await prisma.user.findUnique({ where: { id: order.userId }, select: { email: true } });
  const email = user?.email?.trim();
  if (!pkg || !email || !email.includes('@') || email.endsWith('.invalid')) return 'skipped';

  const { count } = await prisma.paymentOrder.updateMany({
    where: { id: order.id, confirmationEmailSentAt: null },
    data: { confirmationEmailSentAt: new Date() },
  });
  if (count === 0) return 'already'; // eşzamanlı teslimat talebi aldı

  const content = orderConfirmationEmail({
    merchantOrderId: order.merchantOrderId,
    credits: pkg.credits,
    amountKurus: decimalTextToKurus(order.amountTRY.toString()),
    paidAt: order.paidAt,
    locale: order.locale === 'en' ? 'en' : 'tr',
  });
  let ok = false;
  let failure: unknown = null;
  try {
    ok = await send(email, content);
  } catch (err) {
    failure = err;
  }
  if (ok) return 'sent';
  // Talebi geri al: elle / sonraki denemede yeniden gönderilebilsin.
  await prisma.paymentOrder.updateMany({ where: { id: order.id }, data: { confirmationEmailSentAt: null } });
  throw new Error(
    `Sipariş onay e-postası gönderilemedi (merchantOrderId=${order.merchantOrderId}): ` +
      (failure instanceof Error ? failure.message : 'sağlayıcı yapılandırılmamış ya da HTTP hatası'),
  );
}
