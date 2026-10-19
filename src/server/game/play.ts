/**
 * Tahmin oyunu — oyuncu tarafı: tahmin kaydı (kilit SQL'de), kendi haftam, sıralamalar, kilit sonrası dağılım.
 * Herkese açık sıralama Redis'te kısa süre önbellekli (ilk 50, yalnız takma ad + sayılar — Upstash bellek sınırı: küçük
 * tutulur); kişisel veriler her zaman DB'den.
 */
import { randomUUID } from 'node:crypto';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { prisma } from '@/lib/prisma';
import {
  dayAboveSql,
  dayRankSql,
  dayTopSql,
  distributionRowsSql,
  ensureEntriesForMatchesSql,
  myDayTotalSql,
  predictedDaysSql,
  ensureEntrySql,
  mySeasonTotalSql,
  predictedWeeksSql,
  seasonAboveSql,
  seasonRankSql,
  seasonTopSql,
  setJokerSql,
  touchEntrySql,
  upsertPredictionSql,
  weekAboveSql,
  weekRankSql,
  weekTopSql,
  type BoardRow,
  type SqlQuery,
} from '@/lib/game/sql';
import { buildDistribution, isValidGoals, outcomeShares, type Breakdown } from '@/lib/game/scoring';
import { weekStreak } from '@/lib/game/week';
import { listPublicWeekKeys, resolveCurrentWeekKey } from '@/server/game/weeks';
import { listPublicDayKeys, todayKey } from '@/server/game/days';
import type { BoardEntryView, BoardScope, DaySaveResult, DistributionView, LeaderboardView, MyDayView, MyStandingView, MyWeekView, SaveItemResult, SaveResult } from '@/lib/game/types';

export const LEADERBOARD_CACHE_SECONDS = 60;
export const MAX_ITEMS = 10;

const raw = <T>(q: SqlQuery) => prisma.$queryRawUnsafe<T[]>(q.text, ...q.values);

// ── Gövde doğrulama ─────────────────────────────────────────────────────────────────────────────────────────────────

export type SaveBody = { items: { gameMatchId: string; home: number; away: number }[]; jokerGameMatchId?: string | null };

const ID_RE = /^[a-z0-9]{8,40}$/i;

/** PUT gövdesi; bozuksa null. `jokerGameMatchId`: yoksa (undefined) joker değişmez, null → kaldır. */
export function parseSaveBody(body: unknown): SaveBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items) || b.items.length > MAX_ITEMS) return null;
  const items: SaveBody['items'] = [];
  const seen = new Set<string>();
  for (const it of b.items) {
    if (!it || typeof it !== 'object') return null;
    const { gameMatchId, home, away } = it as Record<string, unknown>;
    if (typeof gameMatchId !== 'string' || !ID_RE.test(gameMatchId) || seen.has(gameMatchId)) return null;
    if (!isValidGoals(home) || !isValidGoals(away)) return null;
    seen.add(gameMatchId);
    items.push({ gameMatchId, home, away });
  }
  const j = b.jokerGameMatchId;
  if (j !== undefined && j !== null && (typeof j !== 'string' || !ID_RE.test(j))) return null;
  if (!items.length && j === undefined) return null;
  return { items, ...(j !== undefined ? { jokerGameMatchId: j as string | null } : {}) };
}

const PRED_SELECT = { gameMatchId: true, home: true, away: true, points: true, basePoints: true, breakdown: true } as const;

// ── Kendi haftam ────────────────────────────────────────────────────────────────────────────────────────────────────

async function viewer(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, emailVerified: true } });
  return { nickname: u?.username ?? null, visible: !!u?.username && !!u?.emailVerified };
}

export async function loadMyWeek(userId: string, weekKey: string): Promise<MyWeekView | null> {
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, select: { id: true, status: true } });
  if (!week || week.status === 'DRAFT') return null;
  const [v, entry, preds] = await Promise.all([
    viewer(userId),
    prisma.gameWeekEntry.findUnique({ where: { userId_weekId: { userId, weekId: week.id } } }),
    prisma.gamePrediction.findMany({ where: { userId, weekId: week.id }, select: PRED_SELECT }),
  ]);
  const rank = entry && v.visible ? Number((await raw<{ n: number }>(weekRankSql(week.id, userId)))[0]?.n ?? 0) + 1 : null;
  return {
    weekKey,
    nickname: v.nickname,
    visible: v.visible,
    jokerGameMatchId: entry?.jokerGameMatchId ?? null,
    predictions: preds.map((p) => ({ ...p, breakdown: (p.breakdown as Breakdown | null) ?? null })),
    totalPoints: entry?.totalPoints ?? 0,
    rank,
  };
}

// ── Kaydet ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Tahminleri ve (verildiyse) jokeri yazar. Kalem başına sonuç: başlamış / iptal / bu haftanın olmayan maç → `LOCKED`.
 * Hafta yayında değilse null.
 */
export async function savePredictions(userId: string, weekKey: string, body: SaveBody): Promise<SaveResult | null> {
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, select: { id: true, status: true } });
  if (!week || week.status !== 'PUBLISHED') return null;
  await raw(ensureEntrySql({ id: randomUUID().replace(/-/g, ''), userId, weekKey }));

  const items: SaveItemResult[] = [];
  let changed = false;
  for (const it of body.items) {
    const rows = await raw<{ id: string; changed: boolean }>(
      upsertPredictionSql({ id: randomUUID().replace(/-/g, ''), userId, gameMatchId: it.gameMatchId, weekKey, home: it.home, away: it.away }),
    );
    if (rows[0]) {
      items.push({ gameMatchId: it.gameMatchId, ok: true });
      changed ||= rows[0].changed;
    } else items.push({ gameMatchId: it.gameMatchId, ok: false, code: 'LOCKED' });
  }

  let joker: SaveResult['joker'] = null;
  if (body.jokerGameMatchId !== undefined) {
    const current = await prisma.gameWeekEntry.findUnique({ where: { userId_weekId: { userId, weekId: week.id } }, select: { jokerGameMatchId: true } });
    if (current?.jokerGameMatchId === body.jokerGameMatchId) joker = { ok: true };
    else {
      const rows = await raw<{ id: string }>(setJokerSql(userId, weekKey, body.jokerGameMatchId));
      joker = rows.length ? { ok: true } : { ok: false, code: 'LOCKED' };
    }
  }
  if (changed) await raw(touchEntrySql(userId, weekKey));
  return { items, joker, me: (await loadMyWeek(userId, weekKey))! };
}

// ── Günlük oyun: kendi günüm + kaydet (joker yok) ───────────────────────────────────────────────────────────────────

export async function loadMyDay(userId: string, dayKey: string): Promise<MyDayView | null> {
  const day = await prisma.gameDay.findUnique({ where: { dayKey }, select: { id: true, status: true } });
  if (!day || day.status === 'DRAFT') return null;
  const [v, preds, total] = await Promise.all([
    viewer(userId),
    prisma.gamePrediction.findMany({ where: { userId, dayId: day.id }, select: PRED_SELECT }),
    raw<{ points: number; picks: number }>(myDayTotalSql(day.id, userId)),
  ]);
  const picks = Number(total[0]?.picks ?? 0);
  const rank = picks && v.visible ? Number((await raw<{ n: number }>(dayRankSql(day.id, userId)))[0]?.n ?? 0) + 1 : null;
  return {
    dayKey,
    nickname: v.nickname,
    visible: v.visible,
    predictions: preds.map((p) => ({ ...p, breakdown: (p.breakdown as Breakdown | null) ?? null })),
    totalPoints: Number(total[0]?.points ?? 0),
    rank,
  };
}

/**
 * Günlük tahminleri yazar (joker alanı yok sayılır). Haftalık listede de olan maçta aynı satır güncellenir → iki oyunda sayılır;
 * o haftanın kullanıcı satırı garanti edilir (haftalık toplam ve "son değişiklik" eşitlik ölçütü).
 */
export async function saveDayPredictions(userId: string, dayKey: string, body: SaveBody): Promise<DaySaveResult | null> {
  const day = await prisma.gameDay.findUnique({ where: { dayKey }, select: { id: true, status: true } });
  if (!day || day.status !== 'PUBLISHED') return null;
  const items: SaveItemResult[] = [];
  const changedIds: string[] = [];
  for (const it of body.items) {
    const rows = await raw<{ id: string; changed: boolean }>(
      upsertPredictionSql({ id: randomUUID().replace(/-/g, ''), userId, gameMatchId: it.gameMatchId, dayKey, home: it.home, away: it.away }),
    );
    if (rows[0]) {
      items.push({ gameMatchId: it.gameMatchId, ok: true });
      if (rows[0].changed) changedIds.push(it.gameMatchId);
    } else items.push({ gameMatchId: it.gameMatchId, ok: false, code: 'LOCKED' });
  }
  if (changedIds.length) await raw(ensureEntriesForMatchesSql(userId, changedIds));
  return { items, me: (await loadMyDay(userId, dayKey))! };
}

// ── Sıralama ────────────────────────────────────────────────────────────────────────────────────────────────────────

function toEntries(rows: BoardRow[]): BoardEntryView[] {
  return rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, points: Number(r.points), exact: Number(r.exact), direction: Number(r.direction) }));
}

const boardKey = (scope: string, key: string) => `${cacheKeyPrefix()}game:lb:v1:${scope}:${key}`;

export async function loadLeaderboard(scope: BoardScope, key: string): Promise<LeaderboardView | null> {
  const cacheKey = boardKey(scope, key);
  const cached = (await readCache(cacheKey)) as LeaderboardView | null;
  if (cached) return cached;
  let rows: BoardRow[];
  if (scope === 'week') {
    const week = await prisma.gameWeek.findUnique({ where: { weekKey: key }, select: { id: true, status: true } });
    if (!week || week.status === 'DRAFT') return null;
    // Hiç maç sonuçlanmadıysa tablo anlamsız (herkes 0): boş döner.
    const settled = await prisma.gameMatch.count({ where: { weekId: week.id, status: { not: 'SCHEDULED' } } });
    rows = settled ? await raw<BoardRow>(weekTopSql(week.id)) : [];
  } else if (scope === 'day') {
    const day = await prisma.gameDay.findUnique({ where: { dayKey: key }, select: { id: true, status: true } });
    if (!day || day.status === 'DRAFT') return null;
    const settled = await prisma.gameMatch.count({ where: { dayId: day.id, status: { not: 'SCHEDULED' } } });
    rows = settled ? await raw<BoardRow>(dayTopSql(day.id)) : [];
  } else {
    rows = await raw<BoardRow>(seasonTopSql(key));
  }
  const view: LeaderboardView = { scope, key, entries: toEntries(rows) };
  await writeCache(cacheKey, view, LEADERBOARD_CACHE_SECONDS);
  return view;
}

/** Günlük tablo (sonuç yazılınca). */
export async function invalidateDayLeaderboard(dayKey: string): Promise<void> {
  await writeCache(boardKey('day', dayKey), null, 1);
}

/** Sonuç yazılınca herkese açık tabloları düşür. */
export async function invalidateLeaderboards(weekKey: string, season: string): Promise<void> {
  await Promise.all([writeCache(boardKey('week', weekKey), null, 1), writeCache(boardKey('season', season), null, 1)]);
}

async function myDayStreak(userId: string): Promise<number> {
  const [published, mine] = await Promise.all([listPublicDayKeys(120), raw<{ dayKey: string }>(predictedDaysSql(userId))]);
  return weekStreak(published, new Set(mine.map((r) => r.dayKey)), todayKey());
}

async function myStreak(userId: string): Promise<number> {
  const [published, mine, current] = await Promise.all([listPublicWeekKeys(60), raw<{ weekKey: string }>(predictedWeeksSql(userId)), resolveCurrentWeekKey()]);
  return weekStreak(published, new Set(mine.map((r) => r.weekKey)), current);
}

const abovePoints = async (q: SqlQuery) => {
  const row = (await raw<{ points: number }>(q))[0];
  return row ? Number(row.points) : null;
};

export async function loadMyStanding(userId: string, scope: BoardScope, key: string): Promise<MyStandingView | null> {
  const v = await viewer(userId);
  if (scope === 'day') {
    const day = await prisma.gameDay.findUnique({ where: { dayKey: key }, select: { id: true } });
    if (!day) return null;
    const total = (await raw<{ points: number; exact: number; picks: number }>(myDayTotalSql(day.id, userId)))[0];
    const ranked = Number(total?.picks ?? 0) > 0 && v.visible;
    const [rankRow, above, streak] = await Promise.all([
      ranked ? raw<{ n: number }>(dayRankSql(day.id, userId)) : Promise.resolve([]),
      ranked ? abovePoints(dayAboveSql(day.id, userId)) : Promise.resolve(null),
      myDayStreak(userId),
    ]);
    const points = Number(total?.points ?? 0);
    const rank = ranked ? Number(rankRow[0]?.n ?? 0) + 1 : null;
    return { scope, key, points, exact: Number(total?.exact ?? 0), rank, visible: v.visible, gap: above == null ? null : above - points, streak };
  }
  if (scope === 'week') {
    const week = await prisma.gameWeek.findUnique({ where: { weekKey: key }, select: { id: true } });
    if (!week) return null;
    const entry = await prisma.gameWeekEntry.findUnique({ where: { userId_weekId: { userId, weekId: week.id } } });
    const ranked = !!entry && v.visible && !entry.hiddenAt;
    const [rankRow, above, streak] = await Promise.all([
      ranked ? raw<{ n: number }>(weekRankSql(week.id, userId)) : Promise.resolve([]),
      ranked ? abovePoints(weekAboveSql(week.id, userId)) : Promise.resolve(null),
      myStreak(userId),
    ]);
    const points = entry?.totalPoints ?? 0;
    const rank = ranked ? Number(rankRow[0]?.n ?? 0) + 1 : null;
    return { scope, key, points, exact: entry?.exactCount ?? 0, rank, visible: v.visible, gap: above == null ? null : above - points, streak };
  }
  const total = (await raw<{ points: number; exact: number; weeks: number }>(mySeasonTotalSql(key, userId)))[0];
  const hidden = await prisma.gameWeekEntry.count({ where: { userId, season: key, hiddenAt: { not: null } } });
  const ranked = !!total && total.weeks > 0 && v.visible && !hidden;
  const [rankRow, above, streak] = await Promise.all([
    ranked ? raw<{ n: number }>(seasonRankSql(key, userId)) : Promise.resolve([]),
    ranked ? abovePoints(seasonAboveSql(key, userId)) : Promise.resolve(null),
    myStreak(userId),
  ]);
  const points = Number(total?.points ?? 0);
  const rank = ranked ? Number(rankRow[0]?.n ?? 0) + 1 : null;
  return { scope, key, points, exact: Number(total?.exact ?? 0), rank, visible: v.visible, gap: above == null ? null : above - points, streak };
}

// ── Dağılım (yalnız kilit sonrası) ──────────────────────────────────────────────────────────────────────────────────

export type DistributionOutcome = { kind: 'ok'; view: DistributionView } | { kind: 'not-found' } | { kind: 'locked' };

export async function loadDistribution(gameMatchId: string, now: Date = new Date()): Promise<DistributionOutcome> {
  const m = await prisma.gameMatch.findUnique({
    where: { id: gameMatchId },
    select: { kickoffAt: true, status: true, distribution: true, week: { select: { status: true } }, day: { select: { status: true } } },
  });
  // Yayında en az bir listede olmalı (taslak haftanın maçı görünmez).
  if (!m || ((!m.week || m.week.status === 'DRAFT') && (!m.day || m.day.status === 'DRAFT'))) return { kind: 'not-found' };
  // Başlamadan önce başkalarının tahmini hiçbir uçta dönmez (kopyalama / nadir skor oyunu).
  if (m.status === 'SCHEDULED' && m.kickoffAt > now) return { kind: 'locked' };
  const stored = m.distribution as Record<string, number> | null;
  const dist = stored && typeof stored._total === 'number'
    ? (stored as ReturnType<typeof buildDistribution>)
    : buildDistribution((await raw<{ home: number; away: number; n: number }>(distributionRowsSql(gameMatchId))).flatMap((r) => Array.from({ length: Number(r.n) }, () => ({ home: r.home, away: r.away }))));
  const total = dist._total;
  const top = Object.entries(dist)
    .filter(([k]) => k !== '_total')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([score, n]) => ({ score, pct: total ? Math.round((n / total) * 100) : 0 }));
  return { kind: 'ok', view: { total, shares: outcomeShares(dist), top } };
}
