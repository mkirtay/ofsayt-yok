/**
 * Tahmin oyunu SQL'leri — `$1…` yer tutuculu düz Postgres: canlıda Prisma `$queryRawUnsafe(text, ...values)`, testte
 * PGlite (gerçek motor, aynı metin; src/test/migrations/predictionGame.pglite.test.ts). Tablolar prisma/schema.prisma `Game*`.
 *
 * KİLİT: tahmin ve joker yazımları tek ifadede, `now()` (veritabanı saati) ve `kickoffAt` ile koşullu. İstemci ya da sunucu
 * süreç saati hiç okunmaz; son saniye yarışı DB'de çözülür. Başlamış maça yazım 0 satır döner → çağıran `LOCKED` der.
 *
 * Sıralamada görünme: takma ad (`User.username`) VE doğrulanmış e-posta (`emailVerified`; Google hesapları doğrulanmış) VE
 * admin gizlemesi yok. Eşitlik: puan ↓, tam skor ↓, doğru yön ↓, son değişiklik ↑ (sezon: ilk katılım ↑).
 */
export type SqlQuery = { text: string; values: unknown[] };

export const LEADERBOARD_LIMIT = 50;

const OPEN_MATCH = `m.status = 'SCHEDULED' AND m."kickoffAt" > now()`;

/**
 * Tahmin ekle / güncelle — yalnız maç bu haftanın, hafta YAYINDA ve maç başlamamışsa. Dönen satır yoksa kilitli/geçersiz.
 * `changed`: yeni kayıt ya da skor değişti.
 */
export function upsertPredictionSql(p: { id: string; userId: string; gameMatchId: string; weekKey: string; home: number; away: number }): SqlQuery {
  return {
    text: `WITH old AS (SELECT home, away FROM "GamePrediction" WHERE "userId" = $2 AND "gameMatchId" = $3),
up AS (
INSERT INTO "GamePrediction" (id, "userId", "gameMatchId", "weekId", home, away, "createdAt", "updatedAt")
SELECT $1, $2, m.id, m."weekId", $5, $6, now(), now()
FROM "GameMatch" m JOIN "GameWeek" w ON w.id = m."weekId"
WHERE m.id = $3 AND w."weekKey" = $4 AND w.status = 'PUBLISHED' AND ${OPEN_MATCH}
ON CONFLICT ("userId", "gameMatchId") DO UPDATE SET
  home = EXCLUDED.home,
  away = EXCLUDED.away,
  revisions = "GamePrediction".revisions + CASE WHEN "GamePrediction".home = EXCLUDED.home AND "GamePrediction".away = EXCLUDED.away THEN 0 ELSE 1 END,
  "updatedAt" = CASE WHEN "GamePrediction".home = EXCLUDED.home AND "GamePrediction".away = EXCLUDED.away THEN "GamePrediction"."updatedAt" ELSE now() END
RETURNING id, home, away
)
SELECT up.id, (old.home IS NULL OR old.home <> up.home OR old.away <> up.away) AS changed FROM up LEFT JOIN old ON true`,
    values: [p.id, p.userId, p.gameMatchId, p.weekKey, p.home, p.away],
  };
}

/** Kullanıcı × hafta satırını garanti eder (yayındaki haftada). */
export function ensureEntrySql(p: { id: string; userId: string; weekKey: string }): SqlQuery {
  return {
    text: `INSERT INTO "GameWeekEntry" (id, "userId", "weekId", season, "lastChangeAt", "createdAt")
SELECT $1, $2, w.id, w.season, now(), now() FROM "GameWeek" w WHERE w."weekKey" = $3 AND w.status = 'PUBLISHED'
ON CONFLICT ("userId", "weekId") DO NOTHING`,
    values: [p.id, p.userId, p.weekKey],
  };
}

export function touchEntrySql(userId: string, weekKey: string): SqlQuery {
  return {
    text: `UPDATE "GameWeekEntry" e SET "lastChangeAt" = now() FROM "GameWeek" w WHERE w.id = e."weekId" AND w."weekKey" = $2 AND e."userId" = $1`,
    values: [userId, weekKey],
  };
}

/**
 * Joker seç / kaldır (null). Koşullar: mevcut joker yok ya da mevcut joker maçı başlamamış (başlamış / iptal maçtaki joker
 * taşınamaz — iptalde joker yanar); yeni joker maçı bu haftanın ve başlamamış. 0 satır → `LOCKED`.
 */
export function setJokerSql(userId: string, weekKey: string, gameMatchId: string | null): SqlQuery {
  return {
    text: `UPDATE "GameWeekEntry" e SET "jokerGameMatchId" = $3::text, "lastChangeAt" = now()
FROM "GameWeek" w
WHERE w.id = e."weekId" AND w."weekKey" = $2 AND w.status = 'PUBLISHED' AND e."userId" = $1
  AND (e."jokerGameMatchId" IS NULL OR EXISTS (SELECT 1 FROM "GameMatch" m WHERE m.id = e."jokerGameMatchId" AND ${OPEN_MATCH}))
  AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM "GameMatch" m WHERE m.id = $3::text AND m."weekId" = w.id AND ${OPEN_MATCH}))
RETURNING e.id`,
    values: [userId, weekKey, gameMatchId],
  };
}

/** Sayılan skor dağılımı (yalnız doğrulanmış e-postalı hesaplar). */
export function distributionRowsSql(gameMatchId: string): SqlQuery {
  return {
    text: `SELECT p.home, p.away, count(*)::int AS n FROM "GamePrediction" p JOIN "User" u ON u.id = p."userId"
WHERE p."gameMatchId" = $1 AND u."emailVerified" IS NOT NULL GROUP BY p.home, p.away`,
    values: [gameMatchId],
  };
}

export type ScoringRow = { id: string; home: number; away: number; joker: boolean };

/** Puanlanacak tahminler + joker bilgisi. */
export function predictionsForScoringSql(gameMatchId: string): SqlQuery {
  return {
    text: `SELECT p.id, p.home, p.away, COALESCE(e."jokerGameMatchId" = p."gameMatchId", false) AS joker
FROM "GamePrediction" p LEFT JOIN "GameWeekEntry" e ON e."userId" = p."userId" AND e."weekId" = p."weekId"
WHERE p."gameMatchId" = $1`,
    values: [gameMatchId],
  };
}

/** Toplu puan yazımı (dizi parametreleri). `breakdowns` JSON metinleri. */
export function applyPointsSql(ids: string[], points: number[], breakdowns: string[]): SqlQuery {
  return {
    text: `UPDATE "GamePrediction" p SET points = v.points, breakdown = v.b::jsonb
FROM unnest($1::text[], $2::int[], $3::text[]) AS v(id, points, b) WHERE p.id = v.id`,
    values: [ids, points, breakdowns],
  };
}

/** İptal edilen maçın tahminleri 0 puan. */
export function voidPointsSql(gameMatchId: string): SqlQuery {
  return { text: `UPDATE "GamePrediction" SET points = 0, breakdown = NULL WHERE "gameMatchId" = $1`, values: [gameMatchId] };
}

/** Haftanın kullanıcı toplamlarını sonuçlanmış tahminlerden yeniden hesaplar (idempotent). */
export function recomputeEntriesSql(weekId: string): SqlQuery {
  return {
    text: `UPDATE "GameWeekEntry" e SET "totalPoints" = COALESCE(s.pts, 0), "exactCount" = COALESCE(s.ex, 0), "directionCount" = COALESCE(s.dir, 0)
FROM "GameWeekEntry" e2 LEFT JOIN (
  SELECT "userId", SUM(COALESCE(points, 0))::int AS pts,
         COUNT(*) FILTER (WHERE (breakdown->>'exact')::int > 0)::int AS ex,
         COUNT(*) FILTER (WHERE (breakdown->>'dir')::int > 0)::int AS dir
  FROM "GamePrediction" WHERE "weekId" = $1 GROUP BY "userId"
) s ON s."userId" = e2."userId"
WHERE e.id = e2.id AND e."weekId" = $1`,
    values: [weekId],
  };
}

export type BoardRow = { userId: string; nickname: string; points: number; exact: number; direction: number };

const VISIBLE = `e."hiddenAt" IS NULL AND u.username IS NOT NULL AND u."emailVerified" IS NOT NULL`;
const WEEK_ORDER = `ORDER BY e."totalPoints" DESC, e."exactCount" DESC, e."directionCount" DESC, e."lastChangeAt" ASC, e."userId" ASC`;

export function weekTopSql(weekId: string, limit = LEADERBOARD_LIMIT): SqlQuery {
  return {
    text: `SELECT e."userId", u.username AS nickname, e."totalPoints" AS points, e."exactCount" AS exact, e."directionCount" AS direction
FROM "GameWeekEntry" e JOIN "User" u ON u.id = e."userId" WHERE e."weekId" = $1 AND ${VISIBLE} ${WEEK_ORDER} LIMIT $2`,
    values: [weekId, limit],
  };
}

/** Haftalık sıram: benden önde görünen satır sayısı (+1 çağıranda). */
export function weekRankSql(weekId: string, userId: string): SqlQuery {
  return {
    text: `SELECT count(*)::int AS n FROM "GameWeekEntry" e JOIN "User" u ON u.id = e."userId", "GameWeekEntry" me
WHERE me."weekId" = $1 AND me."userId" = $2 AND e."weekId" = $1 AND ${VISIBLE} AND (
  e."totalPoints" > me."totalPoints"
  OR (e."totalPoints" = me."totalPoints" AND e."exactCount" > me."exactCount")
  OR (e."totalPoints" = me."totalPoints" AND e."exactCount" = me."exactCount" AND e."directionCount" > me."directionCount")
  OR (e."totalPoints" = me."totalPoints" AND e."exactCount" = me."exactCount" AND e."directionCount" = me."directionCount"
      AND (e."lastChangeAt", e."userId") < (me."lastChangeAt", me."userId")))`,
    values: [weekId, userId],
  };
}

const SEASON_AGG = `SELECT e."userId", SUM(e."totalPoints")::int AS points, SUM(e."exactCount")::int AS exact,
  SUM(e."directionCount")::int AS direction, MIN(e."createdAt") AS first_at
FROM "GameWeekEntry" e JOIN "User" u ON u.id = e."userId" WHERE e.season = $1 AND ${VISIBLE} GROUP BY e."userId"`;

export function seasonTopSql(season: string, limit = LEADERBOARD_LIMIT): SqlQuery {
  return {
    text: `SELECT s."userId", u.username AS nickname, s.points, s.exact, s.direction FROM (${SEASON_AGG}) s JOIN "User" u ON u.id = s."userId"
ORDER BY s.points DESC, s.exact DESC, s.direction DESC, s.first_at ASC, s."userId" ASC LIMIT $2`,
    values: [season, limit],
  };
}

export function seasonRankSql(season: string, userId: string): SqlQuery {
  return {
    text: `WITH s AS (${SEASON_AGG}), me AS (SELECT * FROM s WHERE "userId" = $2)
SELECT count(*)::int AS n FROM s, me WHERE
  s.points > me.points
  OR (s.points = me.points AND s.exact > me.exact)
  OR (s.points = me.points AND s.exact = me.exact AND s.direction > me.direction)
  OR (s.points = me.points AND s.exact = me.exact AND s.direction = me.direction AND (s.first_at, s."userId") < (me.first_at, me."userId"))`,
    values: [season, userId],
  };
}

/** Sezonda hemen üstümdeki görünür oyuncunun puanı (benden önde olanların en sonuncusu); lider ya da görünmezsem satır yok. */
export function seasonAboveSql(season: string, userId: string): SqlQuery {
  return {
    text: `WITH s AS (${SEASON_AGG}), me AS (SELECT * FROM s WHERE "userId" = $2)
SELECT s.points FROM s, me WHERE
  s.points > me.points
  OR (s.points = me.points AND s.exact > me.exact)
  OR (s.points = me.points AND s.exact = me.exact AND s.direction > me.direction)
  OR (s.points = me.points AND s.exact = me.exact AND s.direction = me.direction AND (s.first_at, s."userId") < (me.first_at, me."userId"))
ORDER BY s.points ASC, s.exact ASC, s.direction ASC, s.first_at DESC, s."userId" DESC LIMIT 1`,
    values: [season, userId],
  };
}

/** Haftada hemen üstümdeki görünür oyuncunun puanı (sıra ölçütü `weekRankSql` ile aynı). */
export function weekAboveSql(weekId: string, userId: string): SqlQuery {
  return {
    text: `SELECT e."totalPoints" AS points FROM "GameWeekEntry" e JOIN "User" u ON u.id = e."userId", "GameWeekEntry" me
WHERE me."weekId" = $1 AND me."userId" = $2 AND e."weekId" = $1 AND ${VISIBLE} AND (
  e."totalPoints" > me."totalPoints"
  OR (e."totalPoints" = me."totalPoints" AND e."exactCount" > me."exactCount")
  OR (e."totalPoints" = me."totalPoints" AND e."exactCount" = me."exactCount" AND e."directionCount" > me."directionCount")
  OR (e."totalPoints" = me."totalPoints" AND e."exactCount" = me."exactCount" AND e."directionCount" = me."directionCount"
      AND (e."lastChangeAt", e."userId") < (me."lastChangeAt", me."userId")))
ORDER BY e."totalPoints" ASC, e."exactCount" ASC, e."directionCount" ASC, e."lastChangeAt" DESC, e."userId" DESC LIMIT 1`,
    values: [weekId, userId],
  };
}

/** Tahmin yaptığım haftalar (seri hesabı; yeniden eskiye, en çok 60). */
export function predictedWeeksSql(userId: string): SqlQuery {
  return {
    text: `SELECT DISTINCT w."weekKey" AS "weekKey" FROM "GamePrediction" p JOIN "GameWeek" w ON w.id = p."weekId"
WHERE p."userId" = $1 ORDER BY 1 DESC LIMIT 60`,
    values: [userId],
  };
}

/** Sezon toplamım (görünürlükten bağımsız — kendi puanımı her zaman görürüm). */
export function mySeasonTotalSql(season: string, userId: string): SqlQuery {
  return {
    text: `SELECT COALESCE(SUM("totalPoints"), 0)::int AS points, COALESCE(SUM("exactCount"), 0)::int AS exact,
  COALESCE(SUM("directionCount"), 0)::int AS direction, count(*)::int AS weeks FROM "GameWeekEntry" WHERE season = $1 AND "userId" = $2`,
    values: [season, userId],
  };
}
