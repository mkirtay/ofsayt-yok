/**
 * Şikâyet kaydı ve otomatik gizleme. Kullanıcı başına hedef başına tek şikâyet (ContentReport @@unique targetKey +
 * reporterId). Bir gönderi / yoruma eşik kadar FARKLI kullanıcıdan AÇIK şikâyet gelince içerik gizlenir (hiddenReason
 * "REPORTS"); yönetici karar verene kadar yalnız yazar görür. Şikâyet edenin kimliği hiçbir yanıtta / bildirimde yok.
 * Filtrenin ORTA işaretleri de buraya `source: "AUTO"` (reporterId boş) satır olarak düşer — eşiğe sayılmaz.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { REPORT_NOTE_MAX, REPORT_REASONS, reportHideThreshold, type ReportReason } from '@/config/moderation';
import { isDeletedUserId } from '@/config/deletedUser';
import { sanitizePlainText } from '@/lib/security';
import { scheduleAdminReportAlert } from './adminAlert';
import { recordModerationStat, type StatSurface } from './stats';

export const REPORT_TARGET_TYPES = ['POST', 'COMMENT', 'USER'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export function reportTargetKey(type: ReportTargetType, id: string): string {
  return `${type.toLowerCase()}:${id}`;
}

export type ReportInput = { targetType: unknown; targetId: unknown; reason: unknown; note?: unknown };
export type ParsedReport = { targetType: ReportTargetType; targetId: string; reason: ReportReason; note: string | null };

/** Gövde doğrulaması (saf). `targetType` büyük/küçük harf duyarsız; not düz metin, en fazla REPORT_NOTE_MAX. */
export function parseReportInput(input: ReportInput): ParsedReport | { error: string } {
  const type = typeof input.targetType === 'string' ? input.targetType.toUpperCase() : '';
  if (!(REPORT_TARGET_TYPES as readonly string[]).includes(type)) return { error: 'Geçersiz şikâyet hedefi.' };
  const id = typeof input.targetId === 'string' ? input.targetId.trim() : '';
  if (!id || id.length > 64) return { error: 'Geçersiz şikâyet hedefi.' };
  const reason = typeof input.reason === 'string' ? input.reason.toUpperCase() : '';
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { error: 'Geçersiz şikâyet nedeni.' };
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null && input.note !== '') {
    if (typeof input.note !== 'string' || input.note.length > REPORT_NOTE_MAX * 4) return { error: 'Not çok uzun.' };
    const clean = sanitizePlainText(input.note, { maxInputLength: REPORT_NOTE_MAX * 4 });
    if (clean.length > REPORT_NOTE_MAX) return { error: `Not en fazla ${REPORT_NOTE_MAX} karakter olabilir.` };
    note = clean || null;
  }
  return { targetType: type as ReportTargetType, targetId: id, reason: reason as ReportReason, note };
}

export type CreateReportResult =
  | { ok: true; reportId: string; duplicate: false; hidden: boolean }
  | { ok: true; duplicate: true }
  | { ok: false; status: number; code: string; error: string };

type ResolvedTarget = { authorId: string; postId: string | null; commentId: string | null; targetUserId: string };

async function resolveTarget(type: ReportTargetType, id: string): Promise<ResolvedTarget | null> {
  if (type === 'POST') {
    const p = await prisma.post.findFirst({ where: { id, deletedAt: null }, select: { authorId: true } });
    return p ? { authorId: p.authorId, postId: id, commentId: null, targetUserId: p.authorId } : null;
  }
  if (type === 'COMMENT') {
    const c = await prisma.postComment.findFirst({ where: { id, deletedAt: null }, select: { userId: true } });
    return c ? { authorId: c.userId, postId: null, commentId: id, targetUserId: c.userId } : null;
  }
  if (isDeletedUserId(id)) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  return u ? { authorId: u.id, postId: null, commentId: null, targetUserId: u.id } : null;
}

/** Eşik aşıldıysa içeriği gizler (zaten gizliyse dokunmaz). Dönüş: bu çağrıda gizlendi mi. */
export async function applyReportThreshold(type: ReportTargetType, id: string, now = new Date()): Promise<boolean> {
  if (type === 'USER') return false;
  const targetKey = reportTargetKey(type, id);
  const open = await prisma.contentReport.count({ where: { targetKey, status: 'OPEN', source: 'USER' } });
  if (open < reportHideThreshold()) return false;
  const data = { hiddenAt: now, hiddenReason: 'REPORTS' };
  const r =
    type === 'POST'
      ? await prisma.post.updateMany({ where: { id, hiddenAt: null, deletedAt: null }, data })
      : await prisma.postComment.updateMany({ where: { id, hiddenAt: null, deletedAt: null }, data });
  return r.count > 0;
}

export async function createReport(reporterId: string, input: ParsedReport): Promise<CreateReportResult> {
  const target = await resolveTarget(input.targetType, input.targetId);
  if (!target) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Şikâyet edilecek içerik bulunamadı.' };
  if (target.authorId === reporterId) {
    return { ok: false, status: 400, code: 'CANNOT_REPORT_SELF', error: 'Kendi içeriğini şikâyet edemezsin.' };
  }
  const targetKey = reportTargetKey(input.targetType, input.targetId);
  const existing = await prisma.contentReport.findUnique({
    where: { targetKey_reporterId: { targetKey, reporterId } },
    select: { id: true },
  });
  if (existing) return { ok: true, duplicate: true };
  let reportId: string;
  try {
    const row = await prisma.contentReport.create({
      data: {
        targetKey,
        targetType: input.targetType,
        postId: target.postId,
        commentId: target.commentId,
        targetUserId: target.targetUserId,
        reporterId,
        source: 'USER',
        reason: input.reason,
        note: input.note,
      },
      select: { id: true },
    });
    reportId = row.id;
  } catch (e) {
    // Eşzamanlı iki istek (yukarıdaki kontrol arasında) → benzersiz çakışma = zaten şikâyet edilmiş.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true };
    throw e;
  }
  const hidden = await applyReportThreshold(input.targetType, input.targetId);
  scheduleAdminReportAlert();
  return { ok: true, reportId, duplicate: false, hidden };
}

/** Filtrenin ORTA işaretleri (AUTO_*) → yönetici kuyruğu. Eşiğe sayılmaz, kullanıcıya görünmez. */
export async function fileAutoFlags(
  target: { type: 'POST' | 'COMMENT'; id: string; authorId: string },
  reasons: readonly string[],
  surface: StatSurface,
): Promise<void> {
  if (!reasons.length) return;
  const targetKey = reportTargetKey(target.type, target.id);
  await prisma.contentReport.createMany({
    data: reasons.map((reason) => ({
      targetKey,
      targetType: target.type,
      postId: target.type === 'POST' ? target.id : null,
      commentId: target.type === 'COMMENT' ? target.id : null,
      targetUserId: target.authorId,
      reporterId: null,
      source: 'AUTO',
      reason,
    })),
  });
  await recordModerationStat(
    surface,
    reasons.map((r) => r.replace(/^AUTO_/, '').toLowerCase()),
    'flagged',
  );
  scheduleAdminReportAlert();
}
