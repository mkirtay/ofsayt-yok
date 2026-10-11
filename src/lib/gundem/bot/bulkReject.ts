/**
 * Onay kuyruğu toplu reddi (yalnızca ADMIN uçlarından). Silme YOK: durum REJECTED olur. Tek `updateMany` + `where status=PENDING`
 * tek transaction'da: yayınlanmış/onaylanmış/eskimiş kayda dokunulamaz, eşzamanlı tekli onay/ret ile yarışta kazanan tek taraf kalır.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const BULK_REJECT_MAX_IDS = 200;
export const BULK_KINDS = ['GOAL', 'PREVIEW', 'RECAP'] as const;

/** Tam olarak biri: seçili kimlikler · tür/lig filtresi (en az biri) · tümü. */
export type BulkSelector = { ids: string[] } | { kind?: string; league?: string } | { all: true };

export type BulkParse = { ok: true; selector: BulkSelector; dryRun: boolean } | { ok: false; error: string };

export function parseBulkBody(raw: unknown): BulkParse {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const dryRun = b.dryRun === true;
  const hasIds = b.ids !== undefined;
  const hasFilter = b.kind !== undefined || b.league !== undefined;
  const hasAll = b.all !== undefined;
  if ([hasIds, hasFilter, hasAll].filter(Boolean).length !== 1) {
    return { ok: false, error: 'Tam olarak biri gerekli: ids, kind/league ya da all.' };
  }
  if (hasIds) {
    if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > BULK_REJECT_MAX_IDS || !b.ids.every((i) => typeof i === 'string' && i.length > 0 && i.length <= 64)) {
      return { ok: false, error: `ids 1–${BULK_REJECT_MAX_IDS} geçerli kimlik içermeli.` };
    }
    return { ok: true, selector: { ids: [...new Set(b.ids as string[])] }, dryRun };
  }
  if (hasAll) {
    return b.all === true ? { ok: true, selector: { all: true }, dryRun } : { ok: false, error: 'all yalnızca true olabilir.' };
  }
  const kind = b.kind;
  const league = b.league;
  if (kind !== undefined && !(typeof kind === 'string' && (BULK_KINDS as readonly string[]).includes(kind))) return { ok: false, error: 'Geçersiz tür.' };
  if (league !== undefined && !(typeof league === 'string' && league.trim().length > 0 && league.length <= 80)) return { ok: false, error: 'Geçersiz lig.' };
  return { ok: true, selector: { kind: kind as string | undefined, league: league as string | undefined }, dryRun };
}

/** Her zaman `status: PENDING` içerir; seçici yalnızca daraltır. */
export function bulkWhere(sel: BulkSelector): Prisma.GundemBotDraftWhereInput {
  const where: Prisma.GundemBotDraftWhereInput = { status: 'PENDING' };
  if ('ids' in sel) where.id = { in: sel.ids };
  else if (!('all' in sel)) {
    if (sel.kind) where.kind = sel.kind;
    if (sel.league) where.facts = { path: ['leagueName'], equals: sel.league };
  }
  return where;
}

/** Dry-run: kaç bekleyen taslak etkilenir. */
export async function countBulkReject(sel: BulkSelector): Promise<number> {
  return prisma.gundemBotDraft.count({ where: bulkWhere(sel) });
}

export async function bulkRejectDrafts(sel: BulkSelector, adminId: string): Promise<{ rejected: number; skipped: number }> {
  const rejected = await prisma.$transaction(async (tx) => {
    const res = await tx.gundemBotDraft.updateMany({
      where: bulkWhere(sel),
      data: { status: 'REJECTED', decidedById: adminId, decidedAt: new Date() },
    });
    return res.count;
  });
  // Seçili kimliklerden PENDING olmayan / bulunamayanlar (yayınlanmış, eskimiş, zaten reddedilmiş) — dokunulmadı.
  return { rejected, skipped: 'ids' in sel ? sel.ids.length - rejected : 0 };
}

export type PendingSummary = { total: number; kinds: { kind: string; count: number }[]; leagues: { name: string; count: number }[] };
const SUMMARY_MAX_ROWS = 5000;

/** Filtre çipleri için: bekleyenlerin tür ve lig dağılımı (en çok 5000 kayıt taranır). */
export function summarizePending(rows: { kind: string; facts: unknown }[]): PendingSummary {
  const kinds = new Map<string, number>();
  const leagues = new Map<string, number>();
  for (const r of rows) {
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
    const name = (r.facts as { leagueName?: unknown } | null)?.leagueName;
    if (typeof name === 'string' && name.trim()) leagues.set(name, (leagues.get(name) ?? 0) + 1);
  }
  const sorted = <T extends { count: number }>(a: T[]) => a.sort((x, y) => y.count - x.count);
  return {
    total: rows.length,
    kinds: sorted([...kinds].map(([kind, count]) => ({ kind, count }))),
    leagues: sorted([...leagues].map(([name, count]) => ({ name, count }))),
  };
}

export async function loadPendingSummary(): Promise<PendingSummary> {
  const rows = await prisma.gundemBotDraft.findMany({ where: { status: 'PENDING' }, select: { kind: true, facts: true }, take: SUMMARY_MAX_ROWS });
  const summary = summarizePending(rows);
  // Toplam gerçek sayıdan (sınırsız) alınır; dağılım büyük kuyrukta yaklaşıktır.
  return { ...summary, total: await prisma.gundemBotDraft.count({ where: { status: 'PENDING' } }) };
}
