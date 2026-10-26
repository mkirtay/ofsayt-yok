/**
 * Canlı puan durumu katmanı — `GET /standings/live/leagues/{leagueId}` (ayrı `LiveStanding` havuzu, include yok;
 * Süper Lig ~4 KB). Satır: participant_id, position, points, result (up/down/equal), season_id, stage_id, group_id;
 * details (O/G/B/M/averaj) YOK.
 *
 * Yalnız o ligde canlı maç varken sorgulanır (çağıran karar verir: ana sayfa canlı listesi / maç sayfasında maçın
 * durumu). Hata fırlatır; ilk istek hata verirse çağıran normal tabloyu gösterir (hata ≠ "sıra değişmedi").
 *
 * KAYNAKLAR VE ÇİFT SAYIM
 *  - Sıra ve puan HER ZAMAN sağlayıcının canlı tablosundan: ligin eşitlik kuralları (ikili averaj vb.) onda; biz yeniden
 *    sıralamayız, puan eklemeyiz.
 *  - Temel tablo = normal (resmî) puan durumu: biten maçlar. Sıra farkı (↑ 2) ve puan farkı (+1) ona göre — son
 *    poll'a göre değil, aynı veri tekrar gelince oklar kaybolmaz.
 *  - O/G/B/M/A/Y/Av canlı yanıtta yok: canlı maçın skoru temel satıra YALNIZ sağlayıcının canlı puanı tam olarak
 *    "temel + bu skorun puanı" ise eklenir (iki takım için de). Temel tablo maçı zaten içeriyorsa (maç bitti, resmî tablo
 *    güncellendi) ya da sağlayıcı skoru henüz işlemediyse eşitlik tutmaz → ekleme yok. Her sonuçta en az bir takım puan
 *    aldığı için "zaten sayıldı" durumu her zaman yakalanır. Gol sonrası sağlayıcı ~1 dk geride kalabilir: o arada en son
 *    doğrulanmış skor kullanılır (`verified`), iptal edilen golde de doğrulanan skora dönülür.
 *
 * Ok Sportmonks'un `result` alanından değil: o önceki haftaya göre hareket (canlı maç yokken de dolu).
 */
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import { parseScore } from '@/utils/parseScore';

export type LiveStandingRow = {
  participant_id: number;
  position: number;
  points: number;
  result?: string | null;
  season_id?: number | null;
  stage_id?: number | null;
  group_id?: number | null;
};

export type LiveStandingsData = { leagueId: number; rows: LiveStandingRow[] };

export const LIVE_STANDINGS_PATH = (leagueId: number) => `/standings/live/leagues/${leagueId}`;

/** Canlı katman — hata FIRLATIR (react-query yeniden dener, sonra katman yok sayılır). */
export async function fetchLiveStandings(leagueId: number): Promise<LiveStandingsData> {
  const envelope = await sportmonksClientRequest<LiveStandingRow[]>('football', LIVE_STANDINGS_PATH(leagueId));
  const rows = (Array.isArray(envelope.data) ? envelope.data : []).filter(
    (r) => r != null && Number(r.participant_id) > 0 && Number(r.position) > 0 && r.points != null && Number.isFinite(Number(r.points)),
  );
  return { leagueId, rows };
}

type BaseRow = {
  rank: number | string;
  points: number | string;
  matches?: number | string | null;
  won?: number | string | null;
  drawn?: number | string | null;
  lost?: number | string | null;
  goals_scored?: number | string | null;
  goals_conceded?: number | string | null;
  goal_diff?: number | string | null;
  team?: { id?: number | string } | null;
  team_id?: number | string;
};

/** Canlı listedeki maç (models/liveScore `Match` yapısal olarak uyar). */
export type LiveFixtureInput = {
  id: number | string;
  status?: string | null;
  /** Özel durum (iptal, hükmen, ertelendi…); doluysa skor tabloya eklenmez. */
  state_code?: string | null;
  time?: string | null;
  home?: { id?: number | string | null } | null;
  away?: { id?: number | string | null } | null;
  scores?: { score?: string | null } | null;
  score?: string | null;
};

export type LiveTeamStats = {
  matches: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDiff: number | null;
};

/** Satırın takımının şu an oynanan maçı (takımın gözünden). */
export type LiveRowFixture<F extends LiveFixtureInput = LiveFixtureInput> = {
  fixture: F;
  isHome: boolean;
  opponentId: number | null;
  /** Takımın / rakibin golü; skor okunamazsa `null` (uydurulmaz). */
  goalsFor: number | null;
  goalsAgainst: number | null;
};

export type LiveDisplayRow<R, F extends LiveFixtureInput = LiveFixtureInput> = {
  row: R;
  teamId: number | null;
  rank: number;
  /** Temel (maç öncesi) tablodaki sıra. */
  baseRank: number | null;
  /** Temel tabloya göre basamak: + yükseldi, − geriledi, 0 hareket yok. */
  rankDelta: number;
  points: number;
  /** Temel tabloya göre puan farkı (canlı maçın katkısı). */
  pointsDelta: number;
  stats: LiveTeamStats;
  /** `stats` canlı skorla güncellendi (doğrulanmış). */
  statsLive: boolean;
  fixture: LiveRowFixture<F> | null;
};

export type LiveTableResult<R, F extends LiveFixtureInput = LiveFixtureInput> = {
  rows: LiveDisplayRow<R, F>[];
  /** Canlı katman uygulandı (sıra / puan sağlayıcının canlı tablosundan). */
  live: boolean;
  /** Bu tabloyu etkileyen (takımlarından en az biri tabloda olan) canlı maçlar. */
  fixtures: F[];
  /** Doğrulanmış skorlar (maç id → [ev, dep]); çağıran saklayıp bir sonraki hesaplamaya `verified` olarak verir. */
  verified: Map<string, [number, number]>;
};

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const teamIdOf = (r: BaseRow): number | null => num(r.team?.id ?? r.team_id);

const baseStats = (r: BaseRow): LiveTeamStats => ({
  matches: num(r.matches),
  won: num(r.won),
  drawn: num(r.drawn),
  lost: num(r.lost),
  goalsFor: num(r.goals_scored),
  goalsAgainst: num(r.goals_conceded),
  goalDiff: num(r.goal_diff),
});

const add = (a: number | null, b: number): number | null => (a == null ? null : a + b);

function withResult(s: LiveTeamStats, gf: number, ga: number): LiveTeamStats {
  return {
    matches: add(s.matches, 1),
    won: add(s.won, gf > ga ? 1 : 0),
    drawn: add(s.drawn, gf === ga ? 1 : 0),
    lost: add(s.lost, gf < ga ? 1 : 0),
    goalsFor: add(s.goalsFor, gf),
    goalsAgainst: add(s.goalsAgainst, ga),
    goalDiff: add(s.goalDiff, gf - ga),
  };
}

const resultPoints = (gf: number, ga: number) => (gf > ga ? 3 : gf === ga ? 1 : 0);

export function fixtureScore(f: LiveFixtureInput): [number, number] | null {
  return parseScore(f.scores?.score ?? f.score ?? null);
}

const LIVE_STATUSES = new Set(['IN PLAY', 'HALF TIME BREAK']);

/** Maç canlı mı (ana sayfa "Canlı" sekmesiyle aynı kural: oynanıyor / devre arası). */
export function isLiveMatchStatus(status: string | null | undefined): boolean {
  return LIVE_STATUSES.has(String(status ?? '').toUpperCase());
}

/** Normal biten maç (özel durum yok): skoru, resmî tablo henüz güncellenmediyse doğrulanarak eklenebilir. */
export function isPlainFinished(f: Pick<LiveFixtureInput, 'status' | 'state_code'>): boolean {
  return String(f.status ?? '').toUpperCase() === 'FINISHED' && !f.state_code;
}

/** Normal tablo (canlı katman yok) — aynı satır biçimi, farklar sıfır. */
export function baseDisplayRows<R extends BaseRow>(rows: readonly R[]): LiveDisplayRow<R, never>[] {
  return rows.map((row) => ({
    row,
    teamId: teamIdOf(row),
    rank: Number(row.rank),
    baseRank: num(row.rank),
    rankDelta: 0,
    points: Number(row.points),
    pointsDelta: 0,
    stats: baseStats(row),
    statsLive: false,
    fixture: null,
  }));
}

/**
 * Canlı skoru doğrular: aday skorlar (önce güncel, sonra önceki doğrulanmış) içinden sağlayıcının canlı puanıyla tutarlı
 * olan ilki; yoksa `null` (istatistik temel tabloda kalır). Tabloda yalnız bir takım varsa (gruplar arası maç) o takım puan
 * almadıkça doğrulanamaz.
 */
export function verifyFixtureScore(
  candidates: readonly ([number, number] | null | undefined)[],
  home: { base: number; live: number } | null,
  away: { base: number; live: number } | null,
): [number, number] | null {
  if (!home && !away) return null;
  for (const c of candidates) {
    if (!c) continue;
    const [h, a] = c;
    const hp = resultPoints(h, a);
    const ap = resultPoints(a, h);
    const homeOk = !home || home.live === home.base + hp;
    const awayOk = !away || away.live === away.base + ap;
    // Tek takımla puansız sonuç "zaten sayıldı"dan ayırt edilemez.
    const informative = (home ? hp : 0) + (away ? ap : 0) > 0;
    if (homeOk && awayOk && informative) return c;
  }
  return null;
}

/**
 * Normal tablo satırlarına canlı sıra + puanı bindirir, canlı sıraya göre dizer; canlı maçı olan takımlara maç bilgisini,
 * skoru doğrulananlara güncel O/G/B/M/A/Y/Av'yi ekler. Canlı katman uygulanamıyorsa normal tablo (`live: false`): canlı
 * veri yok, sezon farklı (eski sezon seçili), tablodaki takımlardan biri canlı yanıtta yok (yarım bindirme sıra
 * çakıştırırdı) ya da sıralar tekrar ediyor. `stageId` çok aşamalı liglerde aynı takımın diğer aşama satırını ayırır.
 */
export function applyLiveStandings<R extends BaseRow, F extends LiveFixtureInput = LiveFixtureInput>(
  rows: readonly R[],
  live: LiveStandingsData | null | undefined,
  opts: {
    seasonId?: number | string | null;
    stageId?: number | string | null;
    fixtures?: readonly F[] | null;
    verified?: ReadonlyMap<string, [number, number]> | null;
  } = {},
): LiveTableResult<R, F> {
  const fallback: LiveTableResult<R, F> = { rows: baseDisplayRows(rows), live: false, fixtures: [], verified: new Map() };
  if (!live?.rows.length || !rows.length) return fallback;
  const seasonId = num(opts.seasonId);
  const stageId = num(opts.stageId);
  const byTeam = new Map<number, LiveStandingRow[]>();
  for (const l of live.rows) {
    if (seasonId != null && l.season_id != null && Number(l.season_id) !== seasonId) continue;
    const pid = Number(l.participant_id);
    const list = byTeam.get(pid);
    if (list) list.push(l);
    else byTeam.set(pid, [l]);
  }
  if (byTeam.size === 0) return fallback;

  const liveById = new Map<number, LiveStandingRow>();
  const baseById = new Map<number, R>();
  for (const row of rows) {
    const tid = teamIdOf(row);
    const candidates = tid != null ? byTeam.get(tid) : undefined;
    if (tid == null || !candidates?.length) return fallback;
    const hit = stageId != null ? candidates.find((c) => c.stage_id != null && Number(c.stage_id) === stageId) : candidates.length === 1 ? candidates[0] : undefined;
    if (!hit) return fallback;
    liveById.set(tid, hit);
    baseById.set(tid, row);
  }
  // Canlı sıralar tabloda tekrar ediyorsa (gruplu ligde grup eşleşmesi yanlış) bindirme yapılmaz.
  if (new Set([...liveById.values()].map((l) => Number(l.position))).size !== liveById.size) return fallback;

  // Bu tabloyu etkileyen canlı maçlar + doğrulanmış skorlar.
  const fixtures: F[] = [];
  const verified = new Map<string, [number, number]>();
  const fixtureByTeam = new Map<
    number,
    { f: F; isHome: boolean; score: [number, number] | null; checked: [number, number] | null; inPlay: boolean }
  >();
  const seen = new Set<string>();
  for (const f of opts.fixtures ?? []) {
    const key = String(f.id);
    const inPlay = isLiveMatchStatus(f.status);
    // Biten maç yalnız istatistik için (şerit / alt satır yok): sağlayıcı saymış, resmî tablo henüz saymamışsa eklenir;
    // resmî tablo güncellendiyse doğrulama tutmaz (çift sayım yok).
    if (seen.has(key) || (!inPlay && !isPlainFinished(f))) continue;
    const homeId = num(f.home?.id);
    const awayId = num(f.away?.id);
    const homeIn = homeId != null && baseById.has(homeId);
    const awayIn = awayId != null && baseById.has(awayId);
    if (!homeIn && !awayIn) continue;
    seen.add(key);
    if (inPlay) fixtures.push(f);
    const side = (id: number | null, inTable: boolean) =>
      inTable && id != null ? { base: Number(baseById.get(id)!.points), live: Number(liveById.get(id)!.points) } : null;
    const score = fixtureScore(f);
    const checked = verifyFixtureScore([score, opts.verified?.get(key)], side(homeId, homeIn), side(awayId, awayIn));
    if (checked) verified.set(key, checked);
    for (const [id, isHome, inTable] of [[homeId, true, homeIn], [awayId, false, awayIn]] as const) {
      // Canlı maç, aynı takımın biten maçının önüne geçer (aynı gün iki maç olmaz; yine de canlı olan gösterilir).
      if (!inTable || (fixtureByTeam.get(id!)?.inPlay && !inPlay)) continue;
      fixtureByTeam.set(id!, { f, isHome, score, checked, inPlay });
    }
  }

  const out: LiveDisplayRow<R, F>[] = rows.map((row) => {
    const tid = teamIdOf(row)!;
    const hit = liveById.get(tid)!;
    const baseRank = num(row.rank);
    const rank = Number(hit.position);
    const points = Number(hit.points);
    const fx = fixtureByTeam.get(tid);
    const own = (s: [number, number] | null) => (s ? (fx!.isHome ? s : ([s[1], s[0]] as [number, number])) : null);
    const shown = fx ? own(fx.score) : null;
    const checked = fx ? own(fx.checked) : null;
    const opponentId = fx ? num(fx.isHome ? fx.f.away?.id : fx.f.home?.id) : null;
    return {
      row,
      teamId: tid,
      rank,
      baseRank,
      rankDelta: baseRank != null ? baseRank - rank : 0,
      points,
      pointsDelta: points - Number(row.points),
      stats: checked ? withResult(baseStats(row), checked[0], checked[1]) : baseStats(row),
      statsLive: checked != null,
      fixture: fx?.inPlay
        ? { fixture: fx.f, isHome: fx.isHome, opponentId, goalsFor: shown?.[0] ?? null, goalsAgainst: shown?.[1] ?? null }
        : null,
    };
  });
  return { rows: out.sort((a, b) => a.rank - b.rank), live: true, fixtures, verified };
}

/** Canlı katmanın kapısı: listede (ana sayfa canlı poll verisi) bu ligin canlı maçı var mı. Ek istek yok. */
export function hasLiveMatchInLeague(
  matches: readonly { competition?: { id?: number | string | null } | null; status?: string | null }[],
  leagueId: number | null | undefined,
): boolean {
  if (leagueId == null || leagueId <= 0) return false;
  return matches.some((m) => Number(m.competition?.id) === leagueId && isLiveMatchStatus(m.status));
}

/**
 * Canlı puan durumuna verilecek lig maçları: oynanan / devre arasındakiler (şerit, satır alt bilgisi) + normal bitenler
 * (yalnız doğrulanmış istatistik). Aynı maç birden çok listede olabilir: ilk geçen kalır (çağıran canlı listeyi önce verir).
 */
export function standingsMatchesInLeague<M extends LiveFixtureInput & { competition?: { id?: number | string | null } | null }>(
  matches: readonly M[],
  leagueId: number | null | undefined,
): M[] {
  if (leagueId == null || leagueId <= 0) return [];
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = String(m.id);
    if (seen.has(key) || Number(m.competition?.id) !== leagueId || !(isLiveMatchStatus(m.status) || isPlainFinished(m))) return false;
    seen.add(key);
    return true;
  });
}
