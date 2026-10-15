/**
 * Yeni şikâyette yöneticiye e-posta — TOPLU: Redis sabit pencere (ADMIN_ALERT_INTERVAL_MS) içinde en fazla bir özet; ilk
 * şikâyet pencereyi açar, sonrakiler yeni e-posta üretmez (kuyruk sayısı bir sonraki özette). Alıcı:
 * MODERATION_ALERT_EMAIL, yoksa marka iletişim adresi. Yanıttan sonra arka planda çalışır; hata şikâyeti etkilemez.
 */
import { prisma } from '@/lib/prisma';
import { BRAND } from '@/config/brand';
import { ADMIN_ALERT_INTERVAL_MS, REPORT_REVIEW_HOURS } from '@/config/moderation';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { moderationAlertEmail, sendModerationAlertEmail } from '@/lib/security';
import { siteBaseUrl } from '@/lib/siteUrl';
import { runInBackground } from '@/server/backgroundTask';

export function moderationAlertRecipient(): string {
  const env = process.env.MODERATION_ALERT_EMAIL?.trim();
  return env && env.includes('@') ? env : BRAND.contactEmail;
}

/** Açık şikâyeti olan farklı içerik sayısı (özet e-postası ve yönetici rozeti). */
export async function countOpenReportTargets(): Promise<number> {
  const groups = await prisma.contentReport.groupBy({ by: ['targetKey'], where: { status: 'OPEN' } });
  return groups.length;
}

export async function sendAdminReportAlertNow(
  send: typeof sendModerationAlertEmail = sendModerationAlertEmail,
): Promise<'sent' | 'throttled' | 'failed'> {
  const gate = await hitFixedWindowRateLimit('moderation:admin-alert', 1, ADMIN_ALERT_INTERVAL_MS, { memoryFallback: true });
  if (!gate.success) return 'throttled';
  const open = await countOpenReportTargets();
  if (open === 0) return 'throttled';
  const ok = await send(moderationAlertRecipient(), moderationAlertEmail(open, `${siteBaseUrl()}/admin/sikayetler`, REPORT_REVIEW_HOURS));
  return ok ? 'sent' : 'failed';
}

export function scheduleAdminReportAlert(): void {
  runInBackground(() => sendAdminReportAlertNow());
}
