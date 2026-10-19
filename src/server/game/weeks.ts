/**
 * Tahmin oyunu haftaları — okuma (herkese açık görünüm) ve admin işlemleri (taslak, maç listesi, yayın).
 * Takım adları / logolar Gündem'in `MatchSnapshot`'ından (lib/gundem/matchSnapshot.ts): haftaya maç eklenirken snapshot yoksa
 * maç başına bir `fixtures/{id}` (Gündem ile ortak); okuma tarafında sağlayıcıya hiç istek yok.
 */
import type { GameMatch, GameWeek, MatchSnapshot } from '@prisma/client';
import { ensureMatchSnapshot } from '@/lib/gundem/matchSnapshot';
import { isInWeek, seasonOf, weekKeyOf, weekRange } from '@/lib/game/week';
import type { GameMatchView, GameWeekView } from '@/lib/game/types';
import { prisma } from '@/lib/prisma';
import { buildMatchHref } from '@/utils/matchUrl';

/** Haftalık maç sayısı (kullanıcı kararı 2026-10-19: 5 → 10; hafta sonu Süper Lig + büyük ligler, hafta ortası Avrupa kupaları). */
export const WEEK_MATCH_COUNT = 10;

function teamView(id: number, name: string, short: string | null, logo: string | null) {
  return { id, name, shortName: short, logo };
}

export type MatchLists = { weekKey: string | null; dayKey: string | null };

type MatchWithLists = GameMatch & { week?: { weekKey: string } | null; day?: { dayKey: string } | null };

/** Maçın listeleri (ilişkiler yüklendiyse; yoksa bilinen liste anahtarı). */
export const listsOf = (m: MatchWithLists, known: Partial<MatchLists> = {}): MatchLists => ({
  weekKey: m.week?.weekKey ?? (m.weekId ? (known.weekKey ?? null) : null),
  dayKey: m.day?.dayKey ?? (m.dayId ? (known.dayKey ?? null) : null),
});

/** Ortak maç ilişkileri (görünüm için liste anahtarları). */
export const MATCH_LISTS_INCLUDE = { week: { select: { weekKey: true } }, day: { select: { dayKey: true } } } as const;

export function toMatchView(m: GameMatch, snap: MatchSnapshot | undefined, lists: MatchLists = { weekKey: null, dayKey: null }): GameMatchView {
  const homeName = snap?.homeName ?? '?';
  const awayName = snap?.awayName ?? '?';
  return {
    id: m.id,
    fixtureId: m.fixtureId,
    position: m.position ?? m.dayPosition ?? 0,
    kickoffAt: m.kickoffAt.toISOString(),
    status: m.status,
    home: teamView(snap?.homeTeamId ?? 0, homeName, snap?.homeShortName ?? null, snap?.homeLogo ?? null),
    away: teamView(snap?.awayTeamId ?? 0, awayName, snap?.awayShortName ?? null, snap?.awayLogo ?? null),
    result: m.status === 'FINISHED' && m.homeGoals != null && m.awayGoals != null ? { home: m.homeGoals, away: m.awayGoals } : null,
    href: buildMatchHref({ id: Number(m.fixtureId), home: { name: homeName }, away: { name: awayName } }),
    ...lists,
  };
}

export async function snapshotsFor(fixtureIds: string[]): Promise<Map<string, MatchSnapshot>> {
  if (!fixtureIds.length) return new Map();
  const rows = await prisma.matchSnapshot.findMany({ where: { fixtureId: { in: fixtureIds } } });
  return new Map(rows.map((r) => [r.fixtureId, r]));
}

export async function toWeekView(week: GameWeek & { matches: MatchWithLists[] }): Promise<GameWeekView> {
  const matches = [...week.matches].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const snaps = await snapshotsFor(matches.map((m) => m.fixtureId));
  return {
    weekKey: week.weekKey,
    season: week.season,
    status: week.status === 'SETTLED' ? 'SETTLED' : 'PUBLISHED',
    startsAt: week.startsAt.toISOString(),
    endsAt: week.endsAt.toISOString(),
    matches: matches.map((m) => toMatchView(m, snaps.get(m.fixtureId), listsOf(m, { weekKey: week.weekKey }))),
  };
}

/** Yayındaki (taslak olmayan) hafta. */
export async function loadPublicWeek(weekKey: string): Promise<GameWeekView | null> {
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, include: { matches: { include: MATCH_LISTS_INCLUDE } } });
  if (!week || week.status === 'DRAFT') return null;
  return toWeekView(week);
}

/**
 * "Şu anki" hafta: (1) bu TR haftası tahmine açıksa o; (2) değilse tahmine açık en yakın gelecek hafta (ör. Pazar akşamı bu
 * hafta kapandı, gelecek hafta yayında); (3) o da yoksa başlamış en son hafta.
 */
export async function resolveCurrentWeekKey(now: Date = new Date()): Promise<string | null> {
  const thisWeek = weekKeyOf(now.getTime());
  const weeks = await prisma.gameWeek.findMany({
    where: { status: { not: 'DRAFT' } },
    orderBy: { startsAt: 'desc' },
    take: 8,
    select: { weekKey: true, startsAt: true, status: true },
  });
  if (weeks.some((w) => w.weekKey === thisWeek && w.status === 'PUBLISHED')) return thisWeek;
  const upcoming = weeks.filter((w) => w.startsAt > now && w.status === 'PUBLISHED').sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (upcoming) return upcoming.weekKey;
  return weeks.find((w) => w.startsAt <= now)?.weekKey ?? weeks[0]?.weekKey ?? null;
}

/** Yayındaki haftaların listesi (yeniden eskiye) — hafta seçici. */
export async function listPublicWeekKeys(limit = 20): Promise<string[]> {
  const rows = await prisma.gameWeek.findMany({ where: { status: { not: 'DRAFT' } }, orderBy: { startsAt: 'desc' }, take: limit, select: { weekKey: true } });
  return rows.map((r) => r.weekKey);
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export class GameAdminError extends Error {
  constructor(readonly code: 'BAD_WEEK' | 'NOT_FOUND' | 'NOT_DRAFT' | 'BAD_MATCHES' | 'OUT_OF_WEEK' | 'STARTED' | 'SNAPSHOT', message: string) {
    super(message);
    this.name = 'GameAdminError';
  }
}

export type AdminWeekView = GameWeekView & { id: string; rawStatus: GameWeek['status']; entries: number; predictions: number };

export async function loadAdminWeek(weekKey: string): Promise<AdminWeekView | null> {
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, include: { matches: { include: MATCH_LISTS_INCLUDE } } });
  if (!week) return null;
  const [entries, predictions] = await Promise.all([
    prisma.gameWeekEntry.count({ where: { weekId: week.id } }),
    prisma.gamePrediction.count({ where: { weekId: week.id } }),
  ]);
  return { ...(await toWeekView(week)), id: week.id, rawStatus: week.status, entries, predictions };
}

export async function listAdminWeeks(limit = 12) {
  return prisma.gameWeek.findMany({ orderBy: { startsAt: 'desc' }, take: limit, select: { weekKey: true, status: true, season: true, startsAt: true } });
}

/** Taslak hafta (varsa olduğu gibi döner). */
export async function createDraftWeek(weekKey: string): Promise<GameWeek> {
  const range = weekRange(weekKey);
  const season = seasonOf(weekKey);
  if (!range || !season) throw new GameAdminError('BAD_WEEK', 'Geçersiz hafta.');
  return prisma.gameWeek.upsert({
    where: { weekKey },
    create: { weekKey, season, startsAt: range.startsAt, endsAt: range.endsAt },
    update: {},
  });
}

/**
 * Taslak haftanın maç listesini yazar (sıra = dizi sırası). Her maçın snapshot'ı alınır; başlama saati hafta içinde olmalı
 * ve maç başlamamış olmalı. Yalnız TASLAK hafta (yayından sonra liste değişmez; tek tek iptal edilir).
 */
export async function setWeekMatches(weekKey: string, fixtureIds: string[], now: Date = new Date()): Promise<AdminWeekView> {
  const week = await prisma.gameWeek.findUnique({ where: { weekKey } });
  if (!week) throw new GameAdminError('NOT_FOUND', 'Hafta yok.');
  if (week.status !== 'DRAFT') throw new GameAdminError('NOT_DRAFT', 'Yayındaki haftanın listesi değişmez.');
  const ids = [...new Set(fixtureIds.map((s) => String(s).trim()))];
  if (ids.length !== fixtureIds.length || ids.length > WEEK_MATCH_COUNT || ids.some((s) => !/^\d{1,12}$/.test(s))) {
    throw new GameAdminError('BAD_MATCHES', `En çok ${WEEK_MATCH_COUNT} farklı maç.`);
  }
  const snaps: MatchSnapshot[] = [];
  for (const id of ids) {
    try {
      snaps.push(await ensureMatchSnapshot(id));
    } catch {
      throw new GameAdminError('SNAPSHOT', `Maç bilgisi alınamadı: ${id}`);
    }
  }
  for (const s of snaps) {
    if (!isInWeek(weekKey, s.startingAt)) throw new GameAdminError('OUT_OF_WEEK', `Maç hafta dışında: ${s.homeName} – ${s.awayName}`);
    if (s.startingAt <= now) throw new GameAdminError('STARTED', `Maç başlamış: ${s.homeName} – ${s.awayName}`);
  }
  // Maç fixture başına tek satır: günlük listede de olan maç silinmez, yalnız haftadan ayrılır; listedeki maç (varsa günlükten)
  // haftaya bağlanır.
  await prisma.$transaction(async (tx) => {
    await tx.gameMatch.deleteMany({ where: { weekId: week.id, dayId: null, fixtureId: { notIn: ids } } });
    await tx.gameMatch.updateMany({ where: { weekId: week.id, fixtureId: { notIn: ids } }, data: { weekId: null, position: null } });
    for (const [i, sn] of snaps.entries()) {
      await tx.gameMatch.upsert({
        where: { fixtureId: sn.fixtureId },
        create: { weekId: week.id, fixtureId: sn.fixtureId, position: i + 1, kickoffAt: sn.startingAt },
        update: { weekId: week.id, position: i + 1, kickoffAt: sn.startingAt },
      });
    }
  });
  return (await loadAdminWeek(weekKey))!;
}

/** Yayınla: tam `WEEK_MATCH_COUNT` maç ve hiçbiri başlamamış. */
export async function publishWeek(weekKey: string, adminId: string, now: Date = new Date()): Promise<AdminWeekView> {
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, include: { matches: true } });
  if (!week) throw new GameAdminError('NOT_FOUND', 'Hafta yok.');
  if (week.status !== 'DRAFT') throw new GameAdminError('NOT_DRAFT', 'Hafta zaten yayında.');
  if (week.matches.length !== WEEK_MATCH_COUNT) throw new GameAdminError('BAD_MATCHES', `Tam ${WEEK_MATCH_COUNT} maç gerekli.`);
  if (week.matches.some((m) => m.kickoffAt <= now)) throw new GameAdminError('STARTED', 'Listede başlamış maç var.');
  await prisma.gameWeek.update({ where: { id: week.id }, data: { status: 'PUBLISHED', publishedAt: now, publishedById: adminId } });
  return (await loadAdminWeek(weekKey))!;
}
