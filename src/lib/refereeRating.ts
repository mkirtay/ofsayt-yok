/**
 * Hakem puanlama — maç bitince taraftar orta hakeme 1–10 puan verir (giriş zorunlu, kullanıcı başına maç başına tek oy,
 * güncellenebilir). Kurallar istemci (satırın görünürlüğü) ve sunucu (POST doğrulaması) arasında ortak; saf modül
 * (prisma / sunucu içermez, tarayıcı paketine girer).
 *
 * SQL metinleri `$1…` yer tutuculu düz Postgres: canlıda Prisma `$queryRawUnsafe(text, ...values)`, testte PGlite (gerçek
 * migration tablosu; bkz. src/test/migrations/refereeRating.pglite.test.ts). Silinmiş kullanıcı yer tutucusunun satırı
 * (config/deletedUser.ts) hiçbir ortalamaya girmez — normalde hiç olmaz (kullanıcı silinince CASCADE), savunma amaçlı.
 */
import type { Match } from '@/models/liveScore';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { matchKickoffMs } from '@/utils/matchActivity';
import { DELETED_USER_ID } from '@/config/deletedUser';

export const REFEREE_RATING_MIN = 1;
export const REFEREE_RATING_MAX = 10;
export const REFEREE_RATING_SCORES: readonly number[] = Array.from({ length: REFEREE_RATING_MAX }, (_, i) => i + 1);

/** Puanlama başlama saatinden bu kadar sonra kapanır: ~3 sa maç süresi (uzatma + penaltı payı) + 7 gün. */
export const REFEREE_RATING_WINDOW_MS = (7 * 24 + 3) * 60 * 60 * 1000;
/** Hakem sayfasında bu kadar oydan azsa ortalama yerine "yetersiz oy". */
export const REFEREE_RATING_MIN_VOTES = 5;
/** Hakem sayfasında listelenen son puanlanan maç sayısı. */
export const REFEREE_RATING_RECENT_LIMIT = 5;

export type RefereeRatingWindow = 'open' | 'not-finished' | 'closed' | 'no-referee';

type RatingMatch = Pick<Match, 'status' | 'state_code' | 'date' | 'scheduled' | 'referee_id'>;

/**
 * Puan verilebilir mi: orta hakem bilinmeli, maç normal biçimde bitmiş olmalı (ertelendi / iptal / hükmen değil) ve
 * başlama saatinden bu yana `REFEREE_RATING_WINDOW_MS` geçmemiş olmalı. Başlama saati bilinmeyen maç kapalı sayılır.
 */
export function refereeRatingWindow(match: RatingMatch, now: number = Date.now()): RefereeRatingWindow {
  if (!match.referee_id) return 'no-referee';
  if (deriveMatchPhase(match.status) !== 'POST') return 'not-finished';
  const code = match.state_code;
  if (code === 'CANCELLED' || code === 'DELETED' || code === 'POSTPONED' || code === 'AWARDED' || code === 'WALKOVER') return 'not-finished';
  const kickoff = matchKickoffMs(match);
  if (kickoff == null || now - kickoff > REFEREE_RATING_WINDOW_MS) return 'closed';
  return 'open';
}

/** İstek gövdesindeki puan: yalnız 1–10 tam sayı (string "7" kabul edilmez). */
export function parseRefereeScore(body: unknown): number | null {
  const v = body && typeof body === 'object' ? (body as { score?: unknown }).score : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v >= REFEREE_RATING_MIN && v <= REFEREE_RATING_MAX ? v : null;
}

/** Ortalama tek ondalık (ekranda "6,4"); oy yoksa null. */
export function roundAverage(avg: number | null | undefined): number | null {
  return avg == null || !Number.isFinite(avg) ? null : Math.round(avg * 10) / 10;
}

export type RatingAggregate = { average: number | null; count: number };

export type RecentRatedMatch = {
  matchId: string;
  homeName: string;
  awayName: string;
  /** ISO */
  kickoffAt: string;
  average: number;
  count: number;
};

export type RefereeFanRating = RatingAggregate & { recent: RecentRatedMatch[] };

export type SqlQuery = { text: string; values: unknown[] };

export function matchAggregateSql(matchId: string): SqlQuery {
  return {
    text: `SELECT AVG(score)::float8 AS average, COUNT(*)::int AS count FROM "RefereeRating" WHERE "matchId" = $1 AND "userId" <> $2`,
    values: [matchId, DELETED_USER_ID],
  };
}

export function refereeAggregateSql(refereeId: number): SqlQuery {
  return {
    text: `SELECT AVG(score)::float8 AS average, COUNT(*)::int AS count FROM "RefereeRating" WHERE "refereeId" = $1 AND "userId" <> $2`,
    values: [refereeId, DELETED_USER_ID],
  };
}

/**
 * Hakemin son puanlanan maçları (başlama zamanına göre yeni önce), maç başı ortalama + oy sayısı. `kickoffAt` sütunu
 * saat dilimsiz UTC (Prisma `TIMESTAMP(3)`); sürücünün yerel saat yorumuna kalmasın diye ISO metin olarak döner.
 */
export function refereeRecentSql(refereeId: number, limit = REFEREE_RATING_RECENT_LIMIT): SqlQuery {
  return {
    text:
      `SELECT "matchId", MAX("homeName") AS "homeName", MAX("awayName") AS "awayName", to_char(MAX("kickoffAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "kickoffAt", ` +
      `AVG(score)::float8 AS average, COUNT(*)::int AS count FROM "RefereeRating" WHERE "refereeId" = $1 AND "userId" <> $2 ` +
      `GROUP BY "matchId" ORDER BY MAX("kickoffAt") DESC, "matchId" DESC LIMIT $3`,
    values: [refereeId, DELETED_USER_ID, limit],
  };
}

type AggRow = { average: number | string | null; count: number | string | bigint };

export function toAggregate(rows: readonly AggRow[]): RatingAggregate {
  const r = rows[0];
  const count = r ? Number(r.count) : 0;
  return { average: count > 0 ? roundAverage(Number(r!.average)) : null, count };
}

type RecentRow = AggRow & { matchId: string; homeName: string; awayName: string; kickoffAt: Date | string };

export function toRecent(rows: readonly RecentRow[]): RecentRatedMatch[] {
  return rows.map((r) => ({
    matchId: String(r.matchId),
    homeName: r.homeName,
    awayName: r.awayName,
    kickoffAt: (r.kickoffAt instanceof Date ? r.kickoffAt : new Date(r.kickoffAt)).toISOString(),
    average: roundAverage(Number(r.average)) ?? 0,
    count: Number(r.count),
  }));
}
