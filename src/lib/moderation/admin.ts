/**
 * Yönetici moderasyonu (/admin/sikayetler): açık şikâyet kuyruğu (hedef başına grup), işlemler ve denetim kaydı.
 * Her işlem ModerationAction'a yazılır (kim, ne zaman, ne, hangi hedef; içerik metni / e-posta yok). Şikâyet edenin
 * kimliği yöneticiye de gösterilmez (gerek yok): yalnız neden, isteğe bağlı not ve sayı.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { PERMANENT_SUSPENSION, REPORT_REVIEW_HOURS } from '@/config/moderation';
import { isDeletedUserId } from '@/config/deletedUser';
import { isOfficialUser } from '@/lib/gundem/official';
import { createModerationWarning } from '@/lib/gundem/notify';
import { invalidateDictionary, TERM_LEVELS, TERM_MATCHES } from './terms';
import { normalizeTermWord } from './textFilter';

const QUEUE_LIMIT = 50;
const NOTES_PER_TARGET = 5;
const HOUR_MS = 60 * 60_000;

export type QueueItem = {
  targetKey: string;
  targetType: string;
  reportCount: number;
  autoFlags: string[];
  reasons: Record<string, number>;
  notes: string[];
  firstReportedAt: string;
  lastReportedAt: string;
  overdue: boolean;
  content: {
    id: string;
    body: string | null;
    postId: string | null;
    createdAt: string | null;
    deleted: boolean;
    hiddenAt: string | null;
    hiddenReason: string | null;
  } | null;
  author: { id: string; username: string | null; name: string | null; suspendedUntil: string | null } | null;
};

type AuthorRow = { id: string; username: string | null; name: string | null; gundemSuspendedUntil: Date | null };
const authorPick = { id: true, username: true, name: true, gundemSuspendedUntil: true } as const;
const authorOut = (a: AuthorRow | null) =>
  a ? { id: a.id, username: a.username, name: a.name, suspendedUntil: a.gundemSuspendedUntil?.toISOString() ?? null } : null;

export async function listOpenQueue(now = new Date()): Promise<{ items: QueueItem[]; openTargets: number }> {
  const groups = await prisma.contentReport.groupBy({
    by: ['targetKey'],
    where: { status: 'OPEN' },
    _min: { createdAt: true },
    _max: { createdAt: true },
    orderBy: { _min: { createdAt: 'asc' } },
  });
  const page = groups.slice(0, QUEUE_LIMIT);
  const keys = page.map((g) => g.targetKey);
  if (!keys.length) return { items: [], openTargets: 0 };

  const reports = await prisma.contentReport.findMany({
    where: { targetKey: { in: keys }, status: 'OPEN' },
    select: { targetKey: true, targetType: true, postId: true, commentId: true, targetUserId: true, source: true, reason: true, note: true },
    orderBy: { createdAt: 'desc' },
  });
  const postIds = [...new Set(reports.flatMap((r) => (r.postId ? [r.postId] : [])))];
  const commentIds = [...new Set(reports.flatMap((r) => (r.commentId ? [r.commentId] : [])))];
  const userIds = [...new Set(reports.flatMap((r) => (r.targetType === 'USER' && r.targetUserId ? [r.targetUserId] : [])))];
  const [posts, comments, users] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, body: true, createdAt: true, deletedAt: true, hiddenAt: true, hiddenReason: true, author: { select: authorPick } },
        })
      : [],
    commentIds.length
      ? prisma.postComment.findMany({
          where: { id: { in: commentIds } },
          select: {
            id: true,
            postId: true,
            body: true,
            createdAt: true,
            deletedAt: true,
            hiddenAt: true,
            hiddenReason: true,
            user: { select: authorPick },
          },
        })
      : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { ...authorPick, bio: true, createdAt: true } }) : [],
  ]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const commentById = new Map(comments.map((c) => [c.id, c]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const items = page.map((g): QueueItem => {
    const rows = reports.filter((r) => r.targetKey === g.targetKey);
    const first = rows[0];
    const reasons: Record<string, number> = {};
    const autoFlags: string[] = [];
    const notes: string[] = [];
    for (const r of rows) {
      if (r.source === 'AUTO') {
        if (!autoFlags.includes(r.reason)) autoFlags.push(r.reason);
        continue;
      }
      reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      if (r.note && notes.length < NOTES_PER_TARGET) notes.push(r.note);
    }
    let content: QueueItem['content'] = null;
    let author: QueueItem['author'] = null;
    if (first?.postId) {
      const p = postById.get(first.postId);
      if (p) {
        content = {
          id: p.id,
          body: p.body,
          postId: p.id,
          createdAt: p.createdAt.toISOString(),
          deleted: p.deletedAt != null,
          hiddenAt: p.hiddenAt?.toISOString() ?? null,
          hiddenReason: p.hiddenReason,
        };
        author = authorOut(p.author);
      }
    } else if (first?.commentId) {
      const c = commentById.get(first.commentId);
      if (c) {
        content = {
          id: c.id,
          body: c.body,
          postId: c.postId,
          createdAt: c.createdAt.toISOString(),
          deleted: c.deletedAt != null,
          hiddenAt: c.hiddenAt?.toISOString() ?? null,
          hiddenReason: c.hiddenReason,
        };
        author = authorOut(c.user);
      }
    } else if (first?.targetUserId) {
      const u = userById.get(first.targetUserId);
      if (u) {
        content = { id: u.id, body: u.bio, postId: null, createdAt: u.createdAt.toISOString(), deleted: false, hiddenAt: null, hiddenReason: null };
        author = authorOut(u);
      }
    }
    const firstAt = g._min.createdAt ?? now;
    return {
      targetKey: g.targetKey,
      targetType: first?.targetType ?? 'POST',
      reportCount: Object.values(reasons).reduce((a, b) => a + b, 0),
      autoFlags,
      reasons,
      notes,
      firstReportedAt: firstAt.toISOString(),
      lastReportedAt: (g._max.createdAt ?? now).toISOString(),
      overdue: now.getTime() - firstAt.getTime() > REPORT_REVIEW_HOURS * HOUR_MS,
      content,
      author,
    };
  });
  return { items, openTargets: groups.length };
}

// ── İşlemler ────────────────────────────────────────────────────────────────────────────────────────────────────

export const ADMIN_ACTIONS = ['HIDE', 'UNHIDE', 'DELETE', 'DISMISS', 'WARN', 'SUSPEND', 'UNSUSPEND'] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type ActionInput = { action: AdminAction; targetKey?: string | null; userId?: string | null; days?: number | null; note?: string | null };
export type ActionResult = { ok: true; resolvedReports: number } | { ok: false; status: number; error: string };

type Target = { type: 'POST' | 'COMMENT' | 'USER'; id: string; authorId: string | null };

async function loadTarget(targetKey: string): Promise<Target | null> {
  const [kind, id] = targetKey.split(':');
  if (!id) return null;
  if (kind === 'post') {
    const p = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    return p ? { type: 'POST', id, authorId: p.authorId } : null;
  }
  if (kind === 'comment') {
    const c = await prisma.postComment.findUnique({ where: { id }, select: { userId: true } });
    return c ? { type: 'COMMENT', id, authorId: c.userId } : null;
  }
  if (kind === 'user') {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    return u ? { type: 'USER', id, authorId: u.id } : null;
  }
  return null;
}

async function closeReports(targetKey: string, status: 'RESOLVED' | 'DISMISSED', adminId: string, now: Date): Promise<number> {
  const r = await prisma.contentReport.updateMany({
    where: { targetKey, status: 'OPEN' },
    data: { status, resolvedAt: now, resolvedById: adminId },
  });
  return r.count;
}

async function setHidden(t: Target, hidden: boolean, reason: string | null, now: Date) {
  const data = hidden ? { hiddenAt: now, hiddenReason: reason } : { hiddenAt: null, hiddenReason: null };
  if (t.type === 'POST') await prisma.post.update({ where: { id: t.id }, data });
  else if (t.type === 'COMMENT') await prisma.postComment.update({ where: { id: t.id }, data });
}

/** Askıya alınamayan hesap: yönetici, resmi hesap, silinmiş kullanıcı yer tutucusu. */
async function suspendableUser(userId: string): Promise<boolean> {
  if (isDeletedUserId(userId)) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  return !!u && u.role !== 'ADMIN' && !isOfficialUser({ email: u.email });
}

export async function performAdminAction(adminId: string, input: ActionInput, now = new Date()): Promise<ActionResult> {
  const target = input.targetKey ? await loadTarget(input.targetKey) : null;
  if (input.targetKey && !target) return { ok: false, status: 404, error: 'Hedef bulunamadı.' };
  const userId = input.userId ?? target?.authorId ?? null;
  const note = input.note?.trim().slice(0, 300) || null;
  let resolved = 0;
  let meta: Prisma.InputJsonValue | undefined;
  const openCount = input.targetKey
    ? await prisma.contentReport.count({ where: { targetKey: input.targetKey, status: 'OPEN', source: 'USER' } })
    : null;

  switch (input.action) {
    case 'HIDE':
    case 'UNHIDE':
    case 'DELETE': {
      if (!target || target.type === 'USER') return { ok: false, status: 400, error: 'Bu işlem yalnız gönderi / yorum için.' };
      if (input.action === 'DELETE') {
        const data = { deletedAt: now, deletedByUserId: adminId };
        if (target.type === 'POST') await prisma.post.update({ where: { id: target.id }, data });
        else await prisma.postComment.update({ where: { id: target.id }, data });
      } else {
        await setHidden(target, input.action === 'HIDE', 'ADMIN', now);
      }
      resolved = input.action === 'UNHIDE' ? 0 : await closeReports(input.targetKey!, 'RESOLVED', adminId, now);
      break;
    }
    case 'DISMISS': {
      if (!target) return { ok: false, status: 400, error: 'Hedef gerekli.' };
      // Şikâyet yersiz: eşikle gizlenmişse geri açılır (yönetici gizlemesi korunur).
      if (target.type !== 'USER') {
        const row =
          target.type === 'POST'
            ? await prisma.post.findUnique({ where: { id: target.id }, select: { hiddenReason: true } })
            : await prisma.postComment.findUnique({ where: { id: target.id }, select: { hiddenReason: true } });
        if (row?.hiddenReason === 'REPORTS') await setHidden(target, false, null, now);
      }
      resolved = await closeReports(input.targetKey!, 'DISMISSED', adminId, now);
      break;
    }
    case 'WARN': {
      if (!userId || isDeletedUserId(userId)) return { ok: false, status: 400, error: 'Kullanıcı gerekli.' };
      await createModerationWarning(userId);
      if (input.targetKey) resolved = await closeReports(input.targetKey, 'RESOLVED', adminId, now);
      break;
    }
    case 'SUSPEND': {
      if (!userId || !(await suspendableUser(userId))) return { ok: false, status: 400, error: 'Bu hesap askıya alınamaz.' };
      const days = input.days ?? null;
      if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
        return { ok: false, status: 400, error: 'Süre 1–365 gün ya da kalıcı olmalı.' };
      }
      const until = days === null ? PERMANENT_SUSPENSION : new Date(now.getTime() + days * 24 * HOUR_MS);
      await prisma.user.update({ where: { id: userId }, data: { gundemSuspendedUntil: until } });
      meta = { days, until: until.toISOString() };
      if (input.targetKey) resolved = await closeReports(input.targetKey, 'RESOLVED', adminId, now);
      break;
    }
    case 'UNSUSPEND': {
      if (!userId) return { ok: false, status: 400, error: 'Kullanıcı gerekli.' };
      await prisma.user.update({ where: { id: userId }, data: { gundemSuspendedUntil: null } });
      break;
    }
  }
  await prisma.moderationAction.create({
    data: {
      adminId,
      action: input.action,
      targetKey: input.targetKey ?? null,
      targetUserId: userId && !isDeletedUserId(userId) ? userId : null,
      reportCount: openCount,
      note,
      ...(meta ? { meta } : {}),
    },
  });
  return { ok: true, resolvedReports: resolved };
}

// ── Denetim kaydı, sözlük ekleri, sayaçlar ──────────────────────────────────────────────────────────────────────

export async function listModerationLog(limit = 100) {
  const rows = await prisma.moderationAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      action: true,
      targetKey: true,
      reportCount: true,
      note: true,
      meta: true,
      admin: { select: { username: true, name: true } },
      targetUser: { select: { id: true, username: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    targetKey: r.targetKey,
    reportCount: r.reportCount,
    note: r.note,
    meta: r.meta,
    admin: r.admin?.username ?? r.admin?.name ?? null,
    targetUser: r.targetUser ? { id: r.targetUser.id, username: r.targetUser.username } : null,
  }));
}

export async function listModerationStats(days = 30, now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1));
  const rows = await prisma.moderationStat.groupBy({
    by: ['outcome', 'surface', 'category'],
    where: { day: { gte: since } },
    _sum: { count: true },
  });
  return rows
    .map((r) => ({ outcome: r.outcome, surface: r.surface, category: r.category, count: r._sum.count ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

export type TermInput = { term?: unknown; level?: unknown; match?: unknown; category?: unknown };

export async function addModerationTerm(adminId: string, input: TermInput) {
  const raw = typeof input.term === 'string' ? input.term.trim().toLocaleLowerCase('tr-TR') : '';
  if (raw.length < 2 || raw.length > 60 || !/^[\p{L}\p{N} ]+$/u.test(raw) || !normalizeTermWord(raw)) {
    return { ok: false as const, error: 'Terim 2–60 karakter; yalnız harf, rakam ve boşluk.' };
  }
  const level = typeof input.level === 'string' ? input.level.toUpperCase() : '';
  if (!(TERM_LEVELS as readonly string[]).includes(level)) return { ok: false as const, error: 'Geçersiz seviye.' };
  const match = typeof input.match === 'string' && (TERM_MATCHES as readonly string[]).includes(input.match) ? input.match : 'prefix';
  const category =
    typeof input.category === 'string' && /^[a-z_]{2,24}$/.test(input.category) ? input.category : level === 'ALLOW' ? 'allow' : 'custom';
  const row = await prisma.moderationTerm.upsert({
    where: { term: raw },
    create: { term: raw, level, match, category },
    update: { level, match, category },
  });
  await prisma.moderationAction.create({ data: { adminId, action: 'TERM_ADD', meta: { term: raw, level, match, category } } });
  invalidateDictionary();
  return { ok: true as const, term: row };
}

export async function removeModerationTerm(adminId: string, id: string) {
  const row = await prisma.moderationTerm.findUnique({ where: { id }, select: { term: true, level: true } });
  const r = await prisma.moderationTerm.deleteMany({ where: { id } });
  if (r.count && row) await prisma.moderationAction.create({ data: { adminId, action: 'TERM_REMOVE', meta: row } });
  invalidateDictionary();
  return r.count > 0;
}
