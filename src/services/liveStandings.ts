/**
 * Canlı puan durumu katmanı — `GET /standings/live/leagues/{leagueId}` (ayrı `LiveStanding` havuzu, include yok;
 * Süper Lig ~4 KB). Satır: participant_id, position, points, result (up/down/equal), season_id, stage_id, group_id;
 * details (O/G/B/M/averaj) YOK → normal tablonun üstüne yalnız sıra + puan bindirilir.
 *
 * Yalnız o ligde canlı maç varken sorgulanır (çağıran karar verir: ana sayfa canlı listesi / maç sayfasında maçın
 * durumu). Hata fırlatır; katman hata verirse çağıran normal tabloyu sessizce gösterir (hata ≠ "sıra değişmedi").
 *
 * Ok (↑/↓) Sportmonks'un `result` alanından değil, canlı sıra ile normal tablodaki sıranın farkından: `result` önceki
 * haftaya göre hareket (canlı maç yokken de dolu), burada "maçlar sürerken sıra nasıl değişti" gösteriliyor.
 */
import { sportmonksClientRequest } from './sportmonksRuntimeClient';

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

type BaseRow = { rank: number | string; points: number | string; team?: { id?: number | string } | null; team_id?: number | string };

export type LiveMove = 'up' | 'down' | null;

export type LiveDisplayRow<R> = {
  row: R;
  rank: number;
  points: number;
  /** Normal tabloya göre canlı sıra değişimi. */
  move: LiveMove;
  /** Canlı puan normal tablodakinden farklı (maç sürüyor / gol). */
  pointsChanged: boolean;
};

const teamIdOf = (r: BaseRow): number | null => {
  const id = Number(r.team?.id ?? r.team_id);
  return Number.isFinite(id) ? id : null;
};

/**
 * Normal tablo satırlarına canlı sıra + puanı bindirir, canlı sıraya göre dizer. Uygulanamıyorsa `null` (çağıran
 * normal tabloyu çizer): canlı veri yok, sezon farklı (eski sezon seçili), ya da tablodaki takımlardan biri canlı
 * yanıtta yok (yarım bindirme sıra çakıştırırdı). `stageId` çok aşamalı liglerde aynı takımın diğer aşama satırını ayırır.
 */
export function applyLiveStandings<R extends BaseRow>(
  rows: readonly R[],
  live: LiveStandingsData | null | undefined,
  opts: { seasonId?: number | string | null; stageId?: number | string | null } = {},
): LiveDisplayRow<R>[] | null {
  if (!live?.rows.length || !rows.length) return null;
  const seasonId = opts.seasonId != null && opts.seasonId !== '' ? Number(opts.seasonId) : null;
  const stageId = opts.stageId != null && opts.stageId !== '' ? Number(opts.stageId) : null;
  const byTeam = new Map<number, LiveStandingRow[]>();
  for (const l of live.rows) {
    if (seasonId != null && l.season_id != null && Number(l.season_id) !== seasonId) continue;
    const pid = Number(l.participant_id);
    const list = byTeam.get(pid);
    if (list) list.push(l);
    else byTeam.set(pid, [l]);
  }
  if (byTeam.size === 0) return null;

  const out: LiveDisplayRow<R>[] = [];
  for (const row of rows) {
    const tid = teamIdOf(row);
    const candidates = tid != null ? byTeam.get(tid) : undefined;
    if (!candidates?.length) return null;
    const hit = stageId != null ? candidates.find((c) => c.stage_id != null && Number(c.stage_id) === stageId) : candidates.length === 1 ? candidates[0] : undefined;
    if (!hit) return null;
    const baseRank = Number(row.rank);
    const rank = Number(hit.position);
    const points = Number(hit.points);
    out.push({
      row,
      rank,
      points,
      move: Number.isFinite(baseRank) && rank < baseRank ? 'up' : Number.isFinite(baseRank) && rank > baseRank ? 'down' : null,
      pointsChanged: points !== Number(row.points),
    });
  }
  // Canlı sıralar tabloda tekrar ediyorsa (gruplu ligde grup eşleşmesi yanlış) bindirme yapılmaz.
  if (new Set(out.map((r) => r.rank)).size !== out.length) return null;
  return out.sort((a, b) => a.rank - b.rank);
}

const LIVE_STATUSES = new Set(['IN PLAY', 'HALF TIME BREAK']);

/** Maç canlı mı (ana sayfa "Canlı" sekmesiyle aynı kural: oynanıyor / devre arası). */
export function isLiveMatchStatus(status: string | null | undefined): boolean {
  return LIVE_STATUSES.has(String(status ?? '').toUpperCase());
}

/** Canlı katmanın kapısı: listede (ana sayfa canlı poll verisi) bu ligin canlı maçı var mı. Ek istek yok. */
export function hasLiveMatchInLeague(
  matches: readonly { competition?: { id?: number | string | null } | null; status?: string | null }[],
  leagueId: number | null | undefined,
): boolean {
  if (leagueId == null || leagueId <= 0) return false;
  return matches.some((m) => Number(m.competition?.id) === leagueId && isLiveMatchStatus(m.status));
}
