/**
 * Frikik skor tablosu — sıralama kuralı ve SQL. Kullanıcı başına günde tek satır: günün EN İYİ koşusu
 * (`upsertBestRunSql`). Sıralama anahtarı: önce ulaşılan SEVİYE, sonra PUAN, sonra erken kayıt (kurallar metniyle tutarlı: "Sıralama önce ulaşılan seviye, sonra puan"). Aylık tablo: her kullanıcının o ay
 * içindeki tek en iyi günlük kaydı (toplam değil), aynı anahtarla.
 *
 * SQL metinleri `$1…` yer tutuculu düz Postgres: Prisma `$queryRawUnsafe(text, ...values)` ile canlıda, PGlite ile testte
 * (gerçek motor, aynı metin) çalışır. Tablo: FrikikDailyScore (prisma/schema.prisma).
 */

export const LEADERBOARD_LIMIT = 20;
/** Kullanıcı başına günde tabloya gönderilebilen doğrulanmış koşu sayısı (sayaç: server/frikik/attempts.ts). */
export const FRIKIK_DAILY_ATTEMPTS = 5;

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

export type BestRunInput = {
  id: string;
  userId: string;
  day: string;
  month: string;
  score: number;
  level: number;
  cleared: number;
  simVersion: number;
  seed: number;
  shots: number;
};

/**
 * Günün EN İYİ koşusu (tek ifade, yarış güvenli): kayıt yoksa eklenir; varsa yalnız yeni koşu daha yüksek seviye ya da
 * aynı seviyede daha yüksek puansa güncellenir (eşit/kötü → dokunulmaz). Koşul ON CONFLICT … WHERE içinde; satır kilidi
 * altında değerlendirildiği için eşzamanlı iki gönderimden hangisi önce gelirse gelsin en iyisi kalır.
 * Satır dönerse yazıldı (`inserted`: ilk kayıt mı); satır dönmezse mevcut kayıt daha iyi ya da eşit.
 * "createdAt" iyileşmede yenilenir: eşitlikte "erken kayıt" sırası, o sonuca ulaşılan an olsun.
 */
export function upsertBestRunSql(r: BestRunInput): SqlQuery {
  return {
    text:
      `INSERT INTO "FrikikDailyScore" AS b (id, "userId", day, month, score, level, cleared, "simVersion", seed, shots, "createdAt") ` +
      `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) ` +
      `ON CONFLICT ("userId", day) DO UPDATE SET score = EXCLUDED.score, level = EXCLUDED.level, cleared = EXCLUDED.cleared, ` +
      `"simVersion" = EXCLUDED."simVersion", seed = EXCLUDED.seed, shots = EXCLUDED.shots, "createdAt" = EXCLUDED."createdAt" ` +
      `WHERE EXCLUDED.level > b.level OR (EXCLUDED.level = b.level AND EXCLUDED.score > b.score) ` +
      `RETURNING (xmax = 0) AS inserted`,
    values: [r.id, r.userId, r.day, r.month, r.score, r.level, r.cleared, r.simVersion, r.seed, r.shots],
  };
}

// ── Sezon tablosu ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Sezon = futbol sezonu (Temmuz–Haziran, tahmin oyunuyla aynı anahtar: "2026-27"). Puan = sezondaki GÜNLÜK EN İYİ
// koşuların TOPLAMI (aylıktan farklı): her gün oynayan öne geçer. Eşitlikte daha çok oynanan gün, sonra erken başlayan.

/** "2026-11" → "2026-27" (Temmuz ve sonrası yeni sezon). */
export function seasonOfMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Sezonun ay aralığı (dahil): "2026-27" → ["2026-07", "2027-06"]. */
export function seasonMonthRange(season: string): [string, string] {
  const start = Number(season.slice(0, 4));
  return [`${start}-07`, `${start + 1}-06`];
}

export type SeasonRow = { userId: string; nickname: string | null; score: number; days: number };

const SEASON_AGG =
  'SELECT "userId", SUM(score)::int AS score, count(*)::int AS days, MIN("createdAt") AS first_at FROM "FrikikDailyScore" WHERE month >= $1 AND month <= $2 GROUP BY "userId"';
const SEASON_ORDER = 'ORDER BY s.score DESC, s.days DESC, s.first_at ASC, s."userId" ASC';

export function seasonTopSql(season: string, limit = LEADERBOARD_LIMIT): SqlQuery {
  const [from, to] = seasonMonthRange(season);
  return {
    text: `SELECT s."userId", u.username AS nickname, s.score, s.days FROM (${SEASON_AGG}) s JOIN "User" u ON u.id = s."userId" ${SEASON_ORDER} LIMIT $3`,
    values: [from, to, limit],
  };
}

/** Sezon tablosunda kullanıcının toplamı ve sırası (önde olan kullanıcı sayısı + 1); kaydı yoksa satır dönmez. */
export function mySeasonSql(season: string, userId: string): SqlQuery {
  const [from, to] = seasonMonthRange(season);
  return {
    text: `WITH s AS (${SEASON_AGG}), me AS (SELECT * FROM s WHERE "userId" = $3)
SELECT me.score, me.days, (SELECT count(*)::int FROM s WHERE s.score > me.score OR (s.score = me.score AND s.days > me.days)
  OR (s.score = me.score AND s.days = me.days AND (s.first_at, s."userId") < (me.first_at, me."userId"))) + 1 AS rank FROM me`,
    values: [from, to, userId],
  };
}

// ── Ödül sorguları (server/rewards) ───────────────────────────────────────────────────────────────────────────────────

/** Ayın en az `minDays` farklı gününde tabloya yazan kullanıcılar (katılım ödülü). */
export function activeInMonthSql(month: string, minDays: number): SqlQuery {
  return {
    text: `SELECT "userId", count(*)::int AS days FROM "FrikikDailyScore" WHERE month = $1 GROUP BY "userId" HAVING count(*) >= $2`,
    values: [month, minDays],
  };
}
