/**
 * Web bildirimi gönderimi (büyüme raporu 3.1) — VAPID + Web Push protokolü (`web-push`). Abonelik, PushToken tablosunda
 * platform "web" ve token = abonelik JSON'u (endpoint + anahtarlar) olarak saklanır (bkz. /api/push/register).
 * Açık anahtar config/webPush.ts'te (herkese açık); gizli eşi ortamda: VAPID_PRIVATE_KEY (Vercel). Gizli anahtar yoksa
 * gönderim sessizce atlanır (abonelik yine kaydedilir). Yeni çift: `npx web-push generate-vapid-keys`.
 */
import webpush from 'web-push';
import { VAPID_PUBLIC_KEY } from '@/config/webPush';

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Gönderim yapılabilir mi: yalnız gizli anahtarın varlığı (ayrı açma bayrağı yok). */
export function webPushEnabled(): boolean {
  return !!process.env.VAPID_PRIVATE_KEY;
}

let configured = false;
function configure(): void {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:destek@getscor3.com', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Abonelik JSON'u geçerli mi (endpoint https + p256dh + auth). */
export function parseSubscription(token: string): webpush.PushSubscription | null {
  try {
    const s = JSON.parse(token) as webpush.PushSubscription;
    return typeof s?.endpoint === 'string' && s.endpoint.startsWith('https://') && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string' ? s : null;
  } catch {
    return null;
  }
}

/** 'gone' → abonelik artık geçersiz (404/410): token devre dışı bırakılmalı. */
export async function sendWebPush(token: string, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  const sub = parseSubscription(token);
  if (!sub) return 'gone';
  configure();
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 10 * 60, urgency: 'high' });
    return 'ok';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? 'gone' : 'error';
  }
}
