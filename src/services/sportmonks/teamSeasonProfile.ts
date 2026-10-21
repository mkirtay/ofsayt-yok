/**
 * Sezon profili — takım sezon istatistiği isteğinin (`teams/{id}?include=statistics.details…`, bkz. teamSeasonStats.ts)
 * AYNI yanıtındaki, Sezon Özeti'nin kullanmadığı türler. Ek istek yok.
 *
 * Türler (2026-10-21, GS Süper Lig 28203 + ŞL 28155 yanıtı, `statistics.details.type` ile developer_name doğrulandı;
 * Süper Lig 8 maçın devre skorlarıyla ve Osimhen'in oyuncu sezon puanıyla karşılaştırıldı):
 *  27263 GAMES_PLAYED {total} · 52 GOALS all.count · 27249 TOTAL_MINUTES_PLAYED {total_minutes_played}
 *  45 BALL_POSSESSION {count = maç başı yüzdelerin toplamı, average} · 1677 SHOTS {total, on_target}
 *  34 CORNERS {count} · 27253 PASS_STATS {total_passes} · 575 FAILED_TO_SCORE {all,home,away}.count
 *  27256 HALF_RESULTS.scored_both_halves (iki yarıda da gol attığı maç; devre skorlarıyla birebir)
 *  47 PENALTIES {scored, missed} · 84 YELLOWCARDS / 83 REDCARDS {count}
 *  211 HIGHEST_RATED_PLAYER {rating = sezon ortalaması, player_id, player_name}
 *
 * Bilerek kullanılmayanlar: 27250 MOST_SCORED_HALF (takımın değil maçtaki TÜM gollerin yarısı — 10/18 = 17+11 gol),
 * 27256 won_both_halves (devre skorlarından 2 çıkıyor, API 3 diyor) ve comebacks (tanımı doğrulanamadı),
 * 1677 shot_conversion_rate_pct (SL 1, ŞL 100 — anlamsız), 27251/27260 (yenilen goller de karışıyor olabilir),
 * 191/192/27261 (alt/üst ve "karşılıklı gol" — bahis pazarı dili), 9672/9675/27258 (kadro bilgisi, sezon profili değil).
 *
 * Bir türün sezonda hiç gelmemesi "0" sayılmaz: metrik yalnız türün geldiği sezonlardan, paydası o sezonların maçları.
 */

import type { SportmonksTeamStatistic, SportmonksTeamWithStatistics } from './teamSeasonStats';

const T = {
  PLAYED: 27263,
  GOALS: 52,
  MINUTES: 27249,
  POSSESSION: 45,
  SHOTS: 1677,
  CORNERS: 34,
  PASSES: 27253,
  FAILED_TO_SCORE: 575,
  HALF_RESULTS: 27256,
  PENALTIES: 47,
  YELLOW: 84,
  RED: 83,
  BEST_PLAYER: 211,
} as const;

/** Toplam + bu toplamın geldiği sezonların maç sayısı (ortalamanın paydası). */
export type Tally = { total: number; games: number };

export type TeamSeasonProfile = {
  seasonId: number;
  played: number;
  /** Maç başı topa sahip olma yüzdelerinin toplamı (ortalama = total / games). */
  possession: Tally | null;
  shots: Tally | null;
  shotsOnTarget: Tally | null;
  corners: Tally | null;
  passes: Tally | null;
  /** Gol sıklığı: oynanan dakika ve attığı gol (aynı sezonlardan). */
  minutes: { minutes: number; goals: number } | null;
  failedToScore: { all: number; home: number; away: number } | null;
  scoredBothHalves: Tally | null;
  penalties: { scored: number; missed: number } | null;
  yellow: Tally | null;
  red: Tally | null;
  bestPlayer: { playerId: number; name: string; rating: number; seasonId: number; played: number } | null;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function tally(total: number | null, games: number): Tally | null {
  return total == null || games <= 0 ? null : { total, games };
}

export function mapTeamSeasonProfile(stat: SportmonksTeamStatistic): TeamSeasonProfile {
  const byType = new Map<number, Record<string, unknown> | null>();
  for (const d of stat.details ?? []) byType.set(d.type_id, obj(d.value));
  const get = (id: number) => byType.get(id) ?? null;
  const count = (id: number) => num(get(id)?.count);
  const split = (id: number, k: 'all' | 'home' | 'away') => num(obj(get(id)?.[k])?.count);

  const playedRaw = obj(get(T.PLAYED));
  const played = num(playedRaw?.total) ?? 0;

  const shots = get(T.SHOTS);
  const goals = split(T.GOALS, 'all');
  const minutes = num(get(T.MINUTES)?.total_minutes_played);
  const fts = get(T.FAILED_TO_SCORE);
  const pen = get(T.PENALTIES);
  const penScored = num(pen?.scored);
  const penMissed = num(pen?.missed);
  const best = get(T.BEST_PLAYER);
  const bestId = num(best?.player_id);
  const bestRating = num(best?.rating);
  const bestName = typeof best?.player_name === 'string' ? best.player_name.trim() : '';

  return {
    seasonId: stat.season_id,
    played,
    possession: tally(count(T.POSSESSION), played),
    shots: tally(num(shots?.total), played),
    shotsOnTarget: tally(num(shots?.on_target), played),
    corners: tally(count(T.CORNERS), played),
    passes: tally(num(get(T.PASSES)?.total_passes), played),
    minutes: minutes != null && minutes > 0 && goals != null ? { minutes, goals } : null,
    failedToScore: fts
      ? { all: split(T.FAILED_TO_SCORE, 'all') ?? 0, home: split(T.FAILED_TO_SCORE, 'home') ?? 0, away: split(T.FAILED_TO_SCORE, 'away') ?? 0 }
      : null,
    scoredBothHalves: tally(num(get(T.HALF_RESULTS)?.scored_both_halves), played),
    penalties: penScored != null || penMissed != null ? { scored: penScored ?? 0, missed: penMissed ?? 0 } : null,
    yellow: tally(count(T.YELLOW), played),
    red: tally(count(T.RED), played),
    bestPlayer:
      bestId != null && bestRating != null && bestRating > 0 && bestName
        ? { playerId: bestId, name: bestName, rating: bestRating, seasonId: stat.season_id, played }
        : null,
  };
}

/** Yanıttaki sezonlar (maç oynanmamışlar dahil; süzme çağıranın). */
export function mapTeamSeasonProfiles(team: SportmonksTeamWithStatistics | null | undefined): TeamSeasonProfile[] {
  return (team?.statistics ?? []).filter((s) => s?.season_id != null).map(mapTeamSeasonProfile);
}

function addTally(a: Tally | null, b: Tally | null): Tally | null {
  if (!a) return b;
  if (!b) return a;
  return { total: a.total + b.total, games: a.games + b.games };
}

function addPair<T extends Record<string, number>>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof T)[]) out[k] = ((a[k] ?? 0) + (b[k] ?? 0)) as T[keyof T];
  return out;
}

/**
 * "Tümü" sekmesi: türün geldiği sezonların toplamı. En yüksek puanlı oyuncu toplanamaz (sezon ortalaması) → en çok
 * maç oynanan turnuvanınki (eşitlikte yüksek puan); `bestPlayer.seasonId` hangi turnuva olduğunu söyler.
 */
export function combineSeasonProfiles(list: TeamSeasonProfile[]): TeamSeasonProfile {
  return list.reduce<TeamSeasonProfile>(
    (acc, p) => ({
      seasonId: 0,
      played: acc.played + p.played,
      possession: addTally(acc.possession, p.possession),
      shots: addTally(acc.shots, p.shots),
      shotsOnTarget: addTally(acc.shotsOnTarget, p.shotsOnTarget),
      corners: addTally(acc.corners, p.corners),
      passes: addTally(acc.passes, p.passes),
      minutes: addPair(acc.minutes, p.minutes),
      failedToScore: addPair(acc.failedToScore, p.failedToScore),
      scoredBothHalves: addTally(acc.scoredBothHalves, p.scoredBothHalves),
      penalties: addPair(acc.penalties, p.penalties),
      yellow: addTally(acc.yellow, p.yellow),
      red: addTally(acc.red, p.red),
      bestPlayer:
        !acc.bestPlayer || (p.bestPlayer && (p.bestPlayer.played > acc.bestPlayer.played ||
          (p.bestPlayer.played === acc.bestPlayer.played && p.bestPlayer.rating > acc.bestPlayer.rating)))
          ? p.bestPlayer ?? acc.bestPlayer
          : acc.bestPlayer,
    }),
    {
      seasonId: 0,
      played: 0,
      possession: null,
      shots: null,
      shotsOnTarget: null,
      corners: null,
      passes: null,
      minutes: null,
      failedToScore: null,
      scoredBothHalves: null,
      penalties: null,
      yellow: null,
      red: null,
      bestPlayer: null,
    },
  );
}

export type ProfileMetricKey =
  | 'possession'
  | 'shots'
  | 'corners'
  | 'passes'
  | 'minutesPerGoal'
  | 'failedToScore'
  | 'scoredBothHalves'
  | 'penalties'
  | 'yellow'
  | 'bestPlayer';

/**
 * Kartta gösterilecek metrikler (sabit sırada; verisi gelmeyen atlanır). Sayılar ham — biçim (ondalık ayıracı, %)
 * bileşende. Ortalamalar 1 ondalık, topa sahip olma / pas / gol sıklığı tam sayı.
 */
export type ProfileMetric =
  | { key: 'possession'; value: number }
  | { key: 'shots'; value: number; onTarget: number | null }
  | { key: 'corners'; value: number }
  | { key: 'passes'; value: number }
  | { key: 'minutesPerGoal'; value: number }
  | { key: 'failedToScore'; value: number; home: number; away: number }
  | { key: 'scoredBothHalves'; value: number; games: number }
  | { key: 'penalties'; scored: number; attempts: number }
  | { key: 'yellow'; value: number; red: number | null }
  | { key: 'bestPlayer'; value: number; playerId: number; name: string; seasonId: number };

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (t: Tally | null) => (t && t.games > 0 ? t.total / t.games : null);

export function seasonProfileMetrics(p: TeamSeasonProfile | null | undefined): ProfileMetric[] {
  if (!p || p.played <= 0) return [];
  const out: ProfileMetric[] = [];
  const possession = avg(p.possession);
  if (possession != null && possession > 0) out.push({ key: 'possession', value: Math.round(possession) });
  const shots = avg(p.shots);
  if (shots != null && shots > 0) {
    const onTarget = avg(p.shotsOnTarget);
    out.push({ key: 'shots', value: round1(shots), onTarget: onTarget == null ? null : round1(onTarget) });
  }
  const corners = avg(p.corners);
  if (corners != null) out.push({ key: 'corners', value: round1(corners) });
  const passes = avg(p.passes);
  if (passes != null && passes > 0) out.push({ key: 'passes', value: Math.round(passes) });
  if (p.minutes && p.minutes.goals > 0) out.push({ key: 'minutesPerGoal', value: Math.round(p.minutes.minutes / p.minutes.goals) });
  if (p.failedToScore) out.push({ key: 'failedToScore', value: p.failedToScore.all, home: p.failedToScore.home, away: p.failedToScore.away });
  if (p.scoredBothHalves) out.push({ key: 'scoredBothHalves', value: p.scoredBothHalves.total, games: p.scoredBothHalves.games });
  if (p.penalties && p.penalties.scored + p.penalties.missed > 0) {
    out.push({ key: 'penalties', scored: p.penalties.scored, attempts: p.penalties.scored + p.penalties.missed });
  }
  const yellow = avg(p.yellow);
  if (yellow != null) out.push({ key: 'yellow', value: round1(yellow), red: p.red ? p.red.total : null });
  if (p.bestPlayer) {
    const b = p.bestPlayer;
    out.push({ key: 'bestPlayer', value: Math.round(b.rating * 100) / 100, playerId: b.playerId, name: b.name, seasonId: b.seasonId });
  }
  return out;
}
