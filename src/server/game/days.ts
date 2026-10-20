/**
 * Günlük oyun ("Günün 3 maçı") — okuma ve otomatik oluşturma. Gün = İstanbul günü (00:00–24:00), joker yok.
 *
 * Oluşturma (`ensureDailyRound`): sonuç işi (`game-settle`, 10 dk) her turda bugünü dener; gün satırı yoksa günün UTC
 * tarihlerinin önbellekli fikstür listelerinden (ana sayfayla aynı anahtarlar, yeni istek türü yok) başlamamış adaylar
 * seçilir (lib/game/selection.ts → pickDaily) ve maç başına snapshot alınır (yoksa bir `fixtures/{id}`, Gündem ile ortak).
 * Aday yoksa satır açılmaz → "bugün maç yok", seri bozulmaz. Haftalık listede de olan maç aynı satıra bağlanır (çakışma:
 * tek tahmin iki oyunda sayılır).
 */
import type { GameDay, MatchSnapshot, Prisma } from '@prisma/client';
import type { Match } from '@/models/liveScore';
import { captureError } from '@/lib/logger';
import { ensureMatchSnapshot } from '@/lib/gundem/matchSnapshot';
import { attachDayToPredictionsSql } from '@/lib/game/sql';
import { DAILY_LIMITS } from '@/config/gameMatchPriority';
import { candidatesIn, pickDaily, rankCandidates, selectMatches } from '@/lib/game/selection';
import type { GameDayView } from '@/lib/game/types';
import { dayKeyOf, dayRange, utcDatesOfDay } from '@/lib/game/week';
import { prisma } from '@/lib/prisma';
import { getFixturesByDate } from '@/services/liveScoreService';
import { aiReadyFor, GameAdminError, listsOf, MATCH_LISTS_INCLUDE, predictionCountsFor, snapshotsFor, toMatchView } from '@/server/game/weeks';
import type { Suggestion } from '@/server/game/suggestions';

/** Günlük maç sayısı (kullanıcı kararı 2026-10-19). */
export const DAY_MATCH_COUNT = 3;

type DayWithMatches = GameDay & { matches: Prisma.GameMatchGetPayload<{ include: typeof MATCH_LISTS_INCLUDE }>[] };

export async function toDayView(day: DayWithMatches): Promise<GameDayView> {
  const matches = [...day.matches].sort((a, b) => (a.dayPosition ?? 0) - (b.dayPosition ?? 0) || a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const ids = matches.map((m) => m.fixtureId);
  const [snaps, ai] = await Promise.all([snapshotsFor(ids), aiReadyFor(ids)]);
  return {
    dayKey: day.dayKey,
    status: day.status === 'SETTLED' ? 'SETTLED' : 'PUBLISHED',
    startsAt: day.startsAt.toISOString(),
    endsAt: day.endsAt.toISOString(),
    matches: matches.map((m) => ({ ...toMatchView(m, snaps.get(m.fixtureId), listsOf(m, { dayKey: day.dayKey })), position: m.dayPosition ?? 0, aiReady: ai.has(m.fixtureId) })),
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

// ── Admin: günün listesini değiştir ─────────────────────────────────────────────────────────────────────────────────

export type AdminDayView = GameDayView & { id: string; predictionCounts: Record<string, number> };

/** Günün admin görünümü (satır AÇMAZ). */
export async function loadAdminDay(dayKey: string): Promise<AdminDayView | null> {
  const day = await prisma.gameDay.findUnique({ where: { dayKey }, include: { matches: { include: MATCH_LISTS_INCLUDE } } });
  if (!day) return null;
  return { ...(await toDayView(day)), id: day.id, predictionCounts: await predictionCountsFor(day.matches.map((m) => m.id)) };
}

/** Günün aday maçları (öncelik sırası; ilk 3 = otomatik öneri) — haftalık önerilerle aynı şekil. */
export async function loadDaySuggestions(dayKey: string, now: Date = new Date(), listFor = getFixturesByDate): Promise<Suggestion[] | null> {
  const range = dayRange(dayKey);
  if (!range) return null;
  const lists = await Promise.all(utcDatesOfDay(dayKey).map((d) => listFor(d).catch(() => [] as Match[])));
  const cands = candidatesIn(lists.flat(), range.startsAt, range.endsAt, now);
  const auto = new Set(selectMatches(cands, DAY_MATCH_COUNT, DAILY_LIMITS).map((c) => c.fixtureId));
  return rankCandidates(cands)
    .sort((a, b) => Number(auto.has(b.fixtureId)) - Number(auto.has(a.fixtureId)))
    .map((c) => ({ fixtureId: c.fixtureId, kickoffAt: new Date(c.kickoffMs).toISOString(), leagueId: c.leagueId, leagueName: c.leagueName, home: c.home, away: c.away, tier: c.tier, auto: auto.has(c.fixtureId) }));
}

/**
 * Admin günün listesini yazar (en çok 3, sıra = dizi). Gün yoksa açılır (bugün ya da gelecek gün; geçmişte `PAST`). Eklenen maç
 * o gün içinde ve başlamamış olmalı; çıkarılan maç başlamış ya da tahmin almışsa çıkarılmaz. Çıkarılan maç haftalıkta da varsa
 * yalnız günden ayrılır. (Otomatik seçim yalnız gün yokken çalıştığı için admin listesi ezilmez.)
 */
export async function setDayMatches(dayKey: string, fixtureIds: string[], now: Date = new Date()): Promise<AdminDayView> {
  const range = dayRange(dayKey);
  if (!range) throw new GameAdminError('BAD_WEEK', 'Geçersiz gün.');
  if (range.endsAt <= now) throw new GameAdminError('PAST', 'Bitmiş gün değiştirilemez.');
  const ids = [...new Set(fixtureIds.map((s) => String(s).trim()))];
  if (!ids.length || ids.length !== fixtureIds.length || ids.length > DAY_MATCH_COUNT || ids.some((s) => !/^\d{1,12}$/.test(s))) {
    throw new GameAdminError('BAD_MATCHES', `1–${DAY_MATCH_COUNT} farklı maç.`);
  }
  const existing = await prisma.gameDay.findUnique({ where: { dayKey }, include: { matches: { include: { _count: { select: { predictions: true } } } } } });
  const current = new Map((existing?.matches ?? []).map((m) => [m.fixtureId, m]));
  const blocked = (existing?.matches ?? []).filter((m) => !ids.includes(m.fixtureId) && (m.kickoffAt <= now || m._count.predictions > 0));
  if (blocked.length) throw new GameAdminError('HAS_PREDICTIONS', `Başlamış ya da tahmin almış maç listeden çıkarılamaz (${blocked.length}).`);
  const snaps: MatchSnapshot[] = [];
  for (const id of ids) {
    try {
      snaps.push(await ensureMatchSnapshot(id));
    } catch {
      throw new GameAdminError('SNAPSHOT', `Maç bilgisi alınamadı: ${id}`);
    }
  }
  for (const s of snaps) {
    if (current.has(s.fixtureId)) continue;
    if (s.startingAt < range.startsAt || s.startingAt >= range.endsAt) throw new GameAdminError('OUT_OF_WEEK', `Maç bu günde değil: ${s.homeName} – ${s.awayName}`);
    if (s.startingAt <= now) throw new GameAdminError('STARTED', `Maç başlamış: ${s.homeName} – ${s.awayName}`);
  }
  const matchIds = await prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.upsert({ where: { dayKey }, create: { dayKey, startsAt: range.startsAt, endsAt: range.endsAt }, update: {} });
    await tx.gameMatch.deleteMany({ where: { dayId: day.id, weekId: null, fixtureId: { notIn: ids } } });
    await tx.gameMatch.updateMany({ where: { dayId: day.id, fixtureId: { notIn: ids } }, data: { dayId: null, dayPosition: null } });
    const out: string[] = [];
    for (const [i, sn] of snaps.entries()) {
      const m = await tx.gameMatch.upsert({
        where: { fixtureId: sn.fixtureId },
        create: { dayId: day.id, dayPosition: i + 1, fixtureId: sn.fixtureId, kickoffAt: sn.startingAt },
        update: { dayId: day.id, dayPosition: i + 1 },
      });
      out.push(m.id);
    }
    return out;
  });
  const q = attachDayToPredictionsSql(matchIds);
  await prisma.$executeRawUnsafe(q.text, ...q.values);
  return (await loadAdminDay(dayKey))!;
}
