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
  distributionRowsSql,
  ensureEntrySql,
  mySeasonTotalSql,
  seasonRankSql,
  seasonTopSql,
  setJokerSql,
  touchEntrySql,
  upsertPredictionSql,
  weekRankSql,
  weekTopSql,
  type BoardRow,
  type SqlQuery,
} from '@/lib/game/sql';
import { buildDistribution, isValidGoals, outcomeShares, type Breakdown } from '@/lib/game/scoring';
import type { BoardEntryView, DistributionView, LeaderboardView, MyStandingView, MyWeekView, SaveItemResult, SaveResult } from '@/lib/game/types';

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
    prisma.gamePrediction.findMany({ where: { userId, weekId: week.id }, select: { gameMatchId: true, home: true, away: true, points: true, breakdown: true } }),
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

// ── Sıralama ────────────────────────────────────────────────────────────────────────────────────────────────────────

function toEntries(rows: BoardRow[]): BoardEntryView[] {
  return rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, points: Number(r.points), exact: Number(r.exact), direction: Number(r.direction) }));
}

const boardKey = (scope: string, key: string) => `${cacheKeyPrefix()}game:lb:v1:${scope}:${key}`;

export async function loadLeaderboard(scope: 'week' | 'season', key: string): Promise<LeaderboardView | null> {
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
  } else {
    rows = await raw<BoardRow>(seasonTopSql(key));
  }
  const view: LeaderboardView = { scope, key, entries: toEntries(rows) };
  await writeCache(cacheKey, view, LEADERBOARD_CACHE_SECONDS);
  return view;
}

/** Sonuç yazılınca herkese açık tabloları düşür. */
export async function invalidateLeaderboards(weekKey: string, season: string): Promise<void> {
  await Promise.all([writeCache(boardKey('week', weekKey), null, 1), writeCache(boardKey('season', season), null, 1)]);
}

export async function loadMyStanding(userId: string, scope: 'week' | 'season', key: string): Promise<MyStandingView | null> {
  const v = await viewer(userId);
  if (scope === 'week') {
    const week = await prisma.gameWeek.findUnique({ where: { weekKey: key }, select: { id: true } });
    if (!week) return null;
    const entry = await prisma.gameWeekEntry.findUnique({ where: { userId_weekId: { userId, weekId: week.id } } });
    const rank = entry && v.visible && !entry.hiddenAt ? Number((await raw<{ n: number }>(weekRankSql(week.id, userId)))[0]?.n ?? 0) + 1 : null;
    return { scope, key, points: entry?.totalPoints ?? 0, exact: entry?.exactCount ?? 0, rank, visible: v.visible };
  }
  const total = (await raw<{ points: number; exact: number; weeks: number }>(mySeasonTotalSql(key, userId)))[0];
  const hidden = await prisma.gameWeekEntry.count({ where: { userId, season: key, hiddenAt: { not: null } } });
  const rank = total && total.weeks > 0 && v.visible && !hidden ? Number((await raw<{ n: number }>(seasonRankSql(key, userId)))[0]?.n ?? 0) + 1 : null;
  return { scope, key, points: Number(total?.points ?? 0), exact: Number(total?.exact ?? 0), rank, visible: v.visible };
}

// ── Dağılım (yalnız kilit sonrası) ──────────────────────────────────────────────────────────────────────────────────

export type DistributionOutcome = { kind: 'ok'; view: DistributionView } | { kind: 'not-found' } | { kind: 'locked' };

export async function loadDistribution(gameMatchId: string, now: Date = new Date()): Promise<DistributionOutcome> {
  const m = await prisma.gameMatch.findUnique({ where: { id: gameMatchId }, select: { kickoffAt: true, status: true, distribution: true, week: { select: { status: true } } } });
  if (!m || m.week.status === 'DRAFT') return { kind: 'not-found' };
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
