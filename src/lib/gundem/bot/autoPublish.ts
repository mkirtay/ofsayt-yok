/**
 * Otomatik yayın — `GUNDEM_BOT_AUTO_PUBLISH=1` iken bekleyen taslaklar yönetici onayı beklemeden yayınlanır (kullanıcı kararı
 * 2026-11-11: "her seferinde onaylayamam"). Yayın, onay ekranıyla AYNI yoldan geçer (`approveDraft`): maç başlamış PREVIEW
 * eskir (STALE), gol taslağı Sportmonks'tan yeniden doğrulanır (VAR/iptal → STALE). Kapatmak için bayrağı kaldırmak yeterli;
 * kuyruk sayfası elle onaya döner.
 *
 * - Maç önü / sonu (PREVIEW, RECAP): oluşturuldukları tick'te hemen.
 * - Gol (GOAL): en az `GOAL_AUTO_DELAY_MS` bekler (VAR kararı otursun), `GOAL_AUTO_MAX_AGE_MS`'ten eskiyse yayınlanmaz (bayat gol).
 */
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { approveDraft } from './draftActions';

export const AUTO_PUBLISH_ACTOR = 'auto';
export const GOAL_AUTO_DELAY_MS = 3 * 60_000;
export const GOAL_AUTO_MAX_AGE_MS = 30 * 60_000;
/** Tick başına en çok bu kadar yayın (beklenmedik sel olursa akışı boğmasın). */
export const AUTO_PUBLISH_MAX_PER_TICK = 10;

export function isAutoPublishEnabled(env: string | undefined = process.env.GUNDEM_BOT_AUTO_PUBLISH): boolean {
  const v = (env ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export type AutoPublishSummary = { posted: number; stale: number; failed: number };

export async function autoPublishPending(
  opts: { kinds: string[]; minAgeMs?: number; maxAgeMs?: number; now?: number },
  approve: typeof approveDraft = approveDraft,
): Promise<AutoPublishSummary> {
  const now = opts.now ?? Date.now();
  const createdAt: { lte?: Date; gte?: Date } = {};
  if (opts.minAgeMs) createdAt.lte = new Date(now - opts.minAgeMs);
  if (opts.maxAgeMs) createdAt.gte = new Date(now - opts.maxAgeMs);
  const drafts = await prisma.gundemBotDraft.findMany({
    where: { status: 'PENDING', kind: { in: opts.kinds }, ...(opts.minAgeMs || opts.maxAgeMs ? { createdAt } : {}) },
    orderBy: { createdAt: 'asc' },
    take: AUTO_PUBLISH_MAX_PER_TICK,
    select: { id: true },
  });
  const s: AutoPublishSummary = { posted: 0, stale: 0, failed: 0 };
  for (const d of drafts) {
    try {
      const r = await approve(d.id, AUTO_PUBLISH_ACTOR);
      if (r.ok) s.posted += 1;
      else if (r.status === 409) s.stale += 1;
      else s.failed += 1;
    } catch (e) {
      s.failed += 1;
      captureError('gundem:auto-publish', e);
    }
  }
  return s;
}
