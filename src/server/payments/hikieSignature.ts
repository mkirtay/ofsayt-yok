/**
 * Hikie webhook imzası (gerçek Hikie'ye istek YOK; yalnız gelen istek doğrulanır).
 *
 * - Webhook (POST): imza = hex(HMAC-SHA256(webhookSecret, `${Hikie-Timestamp}.${ham gövde}`)). Başlıklar ve gövde
 *   biçimi paymentOrders.parseHikieWebhook'ta (Hikie dokümanı).
 * - Checkout Link callback'i (GET) imza ÜRETMEZ; burada doğrulanacak bir şey yok, kredi vermez.
 * Karşılaştırma sabit zamanlı (timingSafeEqual); zaman damgası en çok 5 dk eski / ileri olabilir (tekrar oynatma).
 * İmza ve secret hiçbir yerde loglanmaz.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_WINDOW_MS = 5 * 60_000;

export function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

/** Sabit zamanlı hex karşılaştırma; biçim / uzunluk uyuşmazlığında false (istisna atmaz). İsteğe bağlı "sha256=" öneki. */
export function signatureMatches(expectedHex: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const g = given.trim().toLowerCase().replace(/^sha256=/, '');
  if (!/^[0-9a-f]+$/.test(g) || g.length !== expectedHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(g, 'hex'));
}

/** Zaman damgası (saniye ya da milisaniye) → ms; geçersizse null. */
export function timestampMs(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = String(raw).trim();
  if (!/^\d{9,14}$/.test(s)) return null;
  const n = Number(s);
  return n < 1e12 ? n * 1000 : n;
}

export function timestampFresh(raw: unknown, now: number = Date.now(), windowMs = SIGNATURE_WINDOW_MS): boolean {
  const t = timestampMs(raw);
  return t != null && Math.abs(now - t) <= windowMs;
}

export function verifyWebhookSignature(secret: string, timestamp: string, rawBody: string, signature: unknown): boolean {
  return signatureMatches(hmacHex(secret, `${timestamp}.${rawBody}`), signature);
}
