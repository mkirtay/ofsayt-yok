/**
 * Frikik skor tablosu — sıralama kuralı ve SQL. Sıralama anahtarı: önce ulaşılan SEVİYE, sonra PUAN, sonra erken
 * kayıt (kurallar metniyle tutarlı: "Sıralama önce ulaşılan seviye, sonra puan"). Aylık tablo: her kullanıcının o ay
 * içindeki tek en iyi günlük kaydı (toplam değil), aynı anahtarla.
 *
 * SQL metinleri `$1…` yer tutuculu düz Postgres: Prisma `$queryRawUnsafe(text, ...values)` ile canlıda, PGlite ile testte
 * (gerçek motor, aynı metin) çalışır. Tablo: FrikikDailyScore (prisma/schema.prisma).
 */

export const LEADERBOARD_LIMIT = 20;

export type RunKey = { level: number; score: number; createdAt: Date };

/** Negatif → a önde. */
export function compareRuns(a: RunKey, b: RunKey): number {
  if (a.level !== b.level) return b.level - a.level;
  if (a.score !== b.score) return b.score - a.score;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** Saf: kayıtlar arasından kullanıcı başına en iyi koşu (aylık tablo mantığının referansı; SQL aynı sonucu vermeli). */
export function monthlyBest<T extends RunKey & { userId: string }>(entries: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const e of entries) {
    const cur = best.get(e.userId);
    if (!cur || compareRuns(e, cur) < 0) best.set(e.userId, e);
  }
  return [...best.values()].sort(compareRuns);
}

/** Sıra = kendisinden önde olan kayıt sayısı + 1. */
export function rankAmong(entries: readonly RunKey[], me: RunKey): number {
  return entries.filter((e) => compareRuns(e, me) < 0).length + 1;
}

export type SqlQuery = { text: string; values: unknown[] };

export type LeaderboardRow = { userId: string; nickname: string | null; level: number; score: number; day: string; createdAt: Date };

const ROW_COLS = 'b."userId", u.username AS nickname, b.level, b.score, b.day, b."createdAt"';
const ORDER = 'ORDER BY b.level DESC, b.score DESC, b."createdAt" ASC';
/** Kullanıcı başına ay içindeki en iyi kayıt (DISTINCT ON + aynı sıralama). */
const MONTH_BEST = 'SELECT DISTINCT ON ("userId") "userId", level, score, day, "createdAt" FROM "FrikikDailyScore" WHERE month = $1 ORDER BY "userId", level DESC, score DESC, "createdAt" ASC';

export function dailyTopSql(day: string, limit = LEADERBOARD_LIMIT): SqlQuery {
  return {
    text: `SELECT ${ROW_COLS} FROM "FrikikDailyScore" b JOIN "User" u ON u.id = b."userId" WHERE b.day = $1 ${ORDER} LIMIT $2`,
    values: [day, limit],
  };
}

export function monthlyTopSql(month: string, limit = LEADERBOARD_LIMIT): SqlQuery {
  return {
    text: `SELECT ${ROW_COLS} FROM (${MONTH_BEST}) b JOIN "User" u ON u.id = b."userId" ${ORDER} LIMIT $2`,
    values: [month, limit],
  };
}

const BETTER = (lvl: string, sc: string, at: string) =>
  `(b.level > ${lvl} OR (b.level = ${lvl} AND b.score > ${sc}) OR (b.level = ${lvl} AND b.score = ${sc} AND b."createdAt" < ${at}))`;

/** Günün tablosunda sıram: benden önde olan kayıt sayısı (+1 çağıranda). */
export function dailyRankSql(day: string, me: RunKey): SqlQuery {
  return {
    text: `SELECT count(*)::int AS n FROM "FrikikDailyScore" b WHERE b.day = $1 AND ${BETTER('$2', '$3', '$4')}`,
    values: [day, me.level, me.score, me.createdAt],
  };
}

/** Ayın tablosunda sıram: en iyi kaydı benimkinden önde olan kullanıcı sayısı. */
export function monthlyRankSql(month: string, me: RunKey): SqlQuery {
  return {
    text: `SELECT count(*)::int AS n FROM (${MONTH_BEST}) b WHERE ${BETTER('$2', '$3', '$4')}`,
    values: [month, me.level, me.score, me.createdAt],
  };
}

/** Kullanıcının ay içindeki en iyi kaydı. */
export function myMonthBestSql(userId: string, month: string): SqlQuery {
  return {
    text: `SELECT b."userId", NULL::text AS nickname, b.level, b.score, b.day, b."createdAt" FROM "FrikikDailyScore" b WHERE b."userId" = $1 AND b.month = $2 ORDER BY b.level DESC, b.score DESC, b."createdAt" ASC LIMIT 1`,
    values: [userId, month],
  };
}
