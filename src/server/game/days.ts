/**
 * Günlük oyun ("Günün 3 maçı") — okuma ve otomatik oluşturma. Gün = İstanbul günü (00:00–24:00), joker yok.
 *
 * Oluşturma (`ensureDailyRound`): sonuç işi (`game-settle`, 10 dk) her turda bugünü dener; gün satırı yoksa günün UTC
 * tarihlerinin önbellekli fikstür listelerinden (ana sayfayla aynı anahtarlar, yeni istek türü yok) başlamamış adaylar
 * seçilir (lib/game/selection.ts → pickDaily) ve maç başına snapshot alınır (yoksa bir `fixtures/{id}`, Gündem ile ortak).
 * Aday yoksa satır açılmaz → "bugün maç yok", seri bozulmaz. Haftalık listede de olan maç aynı satıra bağlanır (çakışma:
 * tek tahmin iki oyunda sayılır).
 */
import type { GameDay, Prisma } from '@prisma/client';
import type { Match } from '@/models/liveScore';
import { captureError } from '@/lib/logger';
import { ensureMatchSnapshot } from '@/lib/gundem/matchSnapshot';
import { attachDayToPredictionsSql } from '@/lib/game/sql';
import { candidatesIn, pickDaily } from '@/lib/game/selection';
import type { GameDayView } from '@/lib/game/types';
import { dayKeyOf, dayRange, utcDatesOfDay } from '@/lib/game/week';
import { prisma } from '@/lib/prisma';
import { getFixturesByDate } from '@/services/liveScoreService';
import { listsOf, MATCH_LISTS_INCLUDE, snapshotsFor, toMatchView } from '@/server/game/weeks';

/** Günlük maç sayısı (kullanıcı kararı 2026-10-19). */
export const DAY_MATCH_COUNT = 3;

type DayWithMatches = GameDay & { matches: Prisma.GameMatchGetPayload<{ include: typeof MATCH_LISTS_INCLUDE }>[] };

export async function toDayView(day: DayWithMatches): Promise<GameDayView> {
  const matches = [...day.matches].sort((a, b) => (a.dayPosition ?? 0) - (b.dayPosition ?? 0) || a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const snaps = await snapshotsFor(matches.map((m) => m.fixtureId));
  return {
    dayKey: day.dayKey,
    status: day.status === 'SETTLED' ? 'SETTLED' : 'PUBLISHED',
    startsAt: day.startsAt.toISOString(),
    endsAt: day.endsAt.toISOString(),
    matches: matches.map((m) => ({ ...toMatchView(m, snaps.get(m.fixtureId), listsOf(m, { dayKey: day.dayKey })), position: m.dayPosition ?? 0 })),
  };
}

export async function loadPublicDay(dayKey: string): Promise<GameDayView | null> {
  const day = await prisma.gameDay.findUnique({ where: { dayKey }, include: { matches: { include: MATCH_LISTS_INCLUDE } } });
  if (!day || day.status === 'DRAFT' || !day.matches.length) return null;
  return toDayView(day);
}

/** Yayındaki (maçlı) günler, yeniden eskiye — seri hesabı. */
export async function listPublicDayKeys(limit = 120): Promise<string[]> {
  const rows = await prisma.gameDay.findMany({ where: { status: { not: 'DRAFT' }, matches: { some: {} } }, orderBy: { startsAt: 'desc' }, take: limit, select: { dayKey: true } });
  return rows.map((r) => r.dayKey);
}

export type EnsureDayDeps = { now?: Date; fixturesForUtcDate?: (isoDate: string) => Promise<Match[]>; snapshot?: typeof ensureMatchSnapshot };

/**
 * Bugünün günlük oyununu garanti eder (idempotent). Var → olduğu gibi. Yok → aday seç, maçları bağla, tahminlerin `dayId`'sini
 * güncelle. Aday yoksa null (satır açılmaz; bir sonraki turda yeniden denenir — liste önbellekten, maliyet yok).
 */
export async function ensureDailyRound(deps: EnsureDayDeps = {}): Promise<GameDay | null> {
  const now = deps.now ?? new Date();
  const dayKey = dayKeyOf(now.getTime());
  const existing = await prisma.gameDay.findUnique({ where: { dayKey } });
  if (existing) return existing;
  const range = dayRange(dayKey)!;
  const listFor = deps.fixturesForUtcDate ?? getFixturesByDate;
  const lists = await Promise.all(utcDatesOfDay(dayKey).map((d) => listFor(d).catch(() => [] as Match[])));
  const picks = pickDaily(candidatesIn(lists.flat(), range.startsAt, range.endsAt, now), DAY_MATCH_COUNT);
  if (!picks.length) return null;

  const snap = deps.snapshot ?? ensureMatchSnapshot;
  const snaps = [];
  for (const p of picks) {
    try {
      snaps.push(await snap(p.fixtureId));
    } catch (e) {
      captureError('game-daily:snapshot', e);
    }
  }
  const usable = snaps.filter((s) => s.startingAt > now && s.startingAt >= range.startsAt && s.startingAt < range.endsAt);
  if (!usable.length) return null;

  return prisma.$transaction(async (tx) => {
    // Yarış: iki tur aynı anda açmaya çalışırsa tekil anahtar ikincisini düşürür.
    const day = await tx.gameDay.upsert({ where: { dayKey }, create: { dayKey, startsAt: range.startsAt, endsAt: range.endsAt }, update: {} });
    const ids: string[] = [];
    for (const [i, s] of usable.entries()) {
      const m = await tx.gameMatch.upsert({
        where: { fixtureId: s.fixtureId },
        create: { dayId: day.id, dayPosition: i + 1, fixtureId: s.fixtureId, kickoffAt: s.startingAt },
        update: { dayId: day.id, dayPosition: i + 1 },
      });
      ids.push(m.id);
    }
    const q = attachDayToPredictionsSql(ids);
    await tx.$executeRawUnsafe(q.text, ...q.values);
    return day;
  });
}

/** Bugünün (İstanbul) günü yayında mı — sayfa ve API için anahtar. */
export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now.getTime());
}
