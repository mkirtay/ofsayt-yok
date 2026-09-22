/**
 * Onay kuyruğu eylemleri (yalnızca ADMIN uçlarından çağrılır). Her geçiş `updateMany where status=PENDING` ile atomik:
 * çift tık / eşzamanlı yönetici tekrar yayın üretemez (ayrıca `createBotPost` `externalKey` ile idempotent).
 */
import { POST_MAX_LENGTH } from '@/config/gundem';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { createBotPost } from '@/lib/gundem/botPost';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { verifyGoalStillValid, type StaleReason } from './goalDraftVerify';
import type { GoalFacts } from './goalTemplates';

export type ActionResult =
  | { ok: true; draft: unknown }
  | { ok: false; status: number; error: string; reason?: StaleReason };

export type ApproveDeps = {
  fetchFixture: (fixtureId: number) => Promise<SportmonksFixture | null>;
};

export const defaultApproveDeps: ApproveDeps = {
  fetchFixture: async (id) => (await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${id}`, { include: 'participants;league;events' })).data ?? null,
};

export async function editDraftBody(id: string, rawBody: unknown): Promise<ActionResult> {
  const body = sanitizePlainText(typeof rawBody === 'string' ? rawBody : '', { allowNewlines: true });
  if (!body || body.length > POST_MAX_LENGTH) return { ok: false, status: 400, error: `Gönderi 1–${POST_MAX_LENGTH} karakter olmalıdır.` };
  const res = await prisma.gundemBotDraft.updateMany({ where: { id, status: 'PENDING' }, data: { body } });
  if (res.count === 0) return notPendingOrMissing(id);
  return { ok: true, draft: await prisma.gundemBotDraft.findUnique({ where: { id } }) };
}

export async function rejectDraft(id: string, adminId: string): Promise<ActionResult> {
  const res = await prisma.gundemBotDraft.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', decidedById: adminId, decidedAt: new Date() },
  });
  if (res.count === 0) return notPendingOrMissing(id);
  return { ok: true, draft: await prisma.gundemBotDraft.findUnique({ where: { id } }) };
}

async function notPendingOrMissing(id: string): Promise<ActionResult> {
  const d = await prisma.gundemBotDraft.findUnique({ where: { id }, select: { status: true } });
  return d ? { ok: false, status: 409, error: `Taslak bekleyen durumda değil (${d.status}).` } : { ok: false, status: 404, error: 'Taslak bulunamadı.' };
}

/** PENDING → (talep) APPROVED → VAR/olay yeniden doğrulaması → yayın → POSTED. Doğrulama bozuksa STALE, hata olursa PENDING'e döner. */
export async function approveDraft(id: string, adminId: string, deps: ApproveDeps = defaultApproveDeps): Promise<ActionResult> {
  const claimed = await prisma.gundemBotDraft.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED', decidedById: adminId, decidedAt: new Date() },
  });
  if (claimed.count === 0) return notPendingOrMissing(id);

  const revert = () => prisma.gundemBotDraft.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PENDING', decidedById: null, decidedAt: null } });

  const draft = await prisma.gundemBotDraft.findUnique({ where: { id } });
  if (!draft || draft.eventId == null) {
    await revert();
    return { ok: false, status: 500, error: 'Taslak eksik veri içeriyor.' };
  }

  let fixture: SportmonksFixture | null;
  try {
    fixture = await deps.fetchFixture(draft.fixtureId);
  } catch {
    await revert();
    return { ok: false, status: 502, error: 'Sportmonks doğrulaması alınamadı; taslak bekliyor, tekrar deneyin.' };
  }
  if (!fixture) {
    await revert();
    return { ok: false, status: 502, error: 'Maç verisi alınamadı; taslak bekliyor, tekrar deneyin.' };
  }

  const verdict = verifyGoalStillValid({ eventId: draft.eventId, facts: draft.facts as unknown as GoalFacts }, fixture);
  if (!verdict.ok) {
    await prisma.gundemBotDraft.update({
      where: { id },
      data: { status: 'STALE', warnings: { push: `stale: ${verdict.reason}` } },
    });
    return { ok: false, status: 409, error: 'Gol artık geçerli görünmüyor (VAR/iptal olabilir); taslak eskidi, yayınlanmadı.', reason: verdict.reason };
  }

  const result = await createBotPost({
    body: draft.body,
    externalKey: draft.externalKey,
    matchId: String(draft.fixtureId),
    teamId: verdict.scorerTeamId,
  });
  if (result.status === 'invalid-body') {
    await revert();
    return { ok: false, status: 400, error: `Gönderi 1–${POST_MAX_LENGTH} karakter olmalıdır.` };
  }
  if (result.status === 'no-account') {
    await revert();
    return { ok: false, status: 500, error: `Resmi hesap bulunamadı (${result.email}).` };
  }
  const posted = await prisma.gundemBotDraft.update({ where: { id }, data: { status: 'POSTED', postId: result.post.id } });
  return { ok: true, draft: posted };
}
