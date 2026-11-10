/**
 * API-Football `teams/statistics` ve `players/topscorers|topassists` → uygulamanın (Sportmonks'tan gelen) mevcut türleri:
 * `TeamSeasonStats` (Sezon Özeti / Gol Dakikaları) ve `TopScorersPayload` (Gol Krallığı). Gerçek cevaplar:
 * __fixtures__/teamStatisticsTurkeyNationsLeague2026.json, topscorersNationsLeague2026.json, topassistsNationsLeague2026.json.
 */
import type { TopScorerEntry, TopScorersPayload } from '@/services/liveScoreService';
import { MINUTE_BUCKETS, type SummaryLine, type TeamSeasonStats } from '@/services/sportmonks/teamSeasonStats';
import { nationalTeamNameTr } from '@/config/nationalTeamNames';
import { toAppId } from './ids';

type Split = { home?: number | null; away?: number | null; total?: number | null };
type MinuteMap = Record<string, { total?: number | null } | undefined>;

export type AfTeamStatistics = {
  league?: { id?: number; season?: number };
  team?: { id?: number };
  form?: string | null;
  fixtures?: { played?: Split; wins?: Split; draws?: Split; loses?: Split };
  goals?: { for?: { total?: Split; minute?: MinuteMap }; against?: { total?: Split; minute?: MinuteMap } };
  clean_sheet?: Split;
};

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** AF 8 dilim (0-15 … 76-90, 91-105, 106-120) → uygulamanın 6 dilimi; uzatma dilimleri son dilime eklenir. */
const AF_MINUTE_KEYS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'] as const;
const AF_EXTRA_KEYS = ['91-105', '106-120'] as const;

function minuteBuckets(map: MinuteMap | undefined): number[] {
  const out = AF_MINUTE_KEYS.map((k) => n(map?.[k]?.total));
  const extra = AF_EXTRA_KEYS.reduce((sum, k) => sum + n(map?.[k]?.total), 0);
  out[MINUTE_BUCKETS.length - 1] = out[MINUTE_BUCKETS.length - 1]! + extra;
  return out;
}

/** Oynanmış maç yoksa (played.total 0) veya yanıt boşsa null → bölüm gizlenir (hata ≠ veri yok: hata çağıranda ayrılır). */
export function mapTeamStatistics(stat: AfTeamStatistics | null | undefined): TeamSeasonStats | null {
  if (!stat || !stat.fixtures) return null;
  const f = stat.fixtures;
  const line = (k: 'total' | 'home' | 'away'): SummaryLine => ({
    played: n(f.played?.[k]),
    won: n(f.wins?.[k]),
    drawn: n(f.draws?.[k]),
    lost: n(f.loses?.[k]),
    goalsFor: n(stat.goals?.for?.total?.[k]),
    goalsAgainst: n(stat.goals?.against?.total?.[k]),
    cleanSheets: n(stat.clean_sheet?.[k]),
  });
  const total = line('total');
  if (total.played === 0) return null;
  return {
    seasonId: n(stat.league?.season),
    ...(stat.league?.id != null ? { leagueId: toAppId(stat.league.id) } : {}),
    finished: false,
    total,
    home: line('home'),
    away: line('away'),
    scoredByMinute: minuteBuckets(stat.goals?.for?.minute),
    concededByMinute: minuteBuckets(stat.goals?.against?.minute),
  };
}

type AfPlayerRow = {
  player: { id: number; name: string; photo?: string | null };
  statistics: Array<{
    team?: { id: number; name?: string; logo?: string | null };
    games?: { appearences?: number | null };
    goals?: { total?: number | null; assists?: number | null };
  }>;
};

function toEntry(row: AfPlayerRow): TopScorerEntry | null {
  const s = row.statistics?.[0];
  if (!s) return null;
  return {
    goals: n(s.goals?.total),
    assists: n(s.goals?.assists),
    ...(s.games?.appearences != null ? { played: s.games.appearences } : {}),
    ...(s.team?.id != null ? { team: { id: toAppId(s.team.id), name: s.team.name ? nationalTeamNameTr(s.team.name) : undefined, ...(s.team.logo ? { logo: s.team.logo } : {}) } } : {}),
    // Oyuncu sayfası (Sportmonks) milli oyuncu id'siyle yok → id verilmez (bağlantı çizilmez).
    player: { name: row.player.name, ...(row.player.photo ? { photo: row.player.photo } : {}) },
  };
}

/** Gol listesi + asist listesi birleşir (aynı oyuncu bir kez); gol sırasına göre, eşitlikte asist. Boşsa null. */
export function mapTopScorers(scorers: AfPlayerRow[], assisters: AfPlayerRow[], leagueName: string, appLeagueId: number, season: number): TopScorersPayload | null {
  const merged = new Map<number, TopScorerEntry>();
  for (const row of [...scorers, ...assisters]) {
    if (merged.has(row.player.id)) continue;
    const e = toEntry(row);
    if (e) merged.set(row.player.id, e);
  }
  const list = [...merged.values()].sort((a, b) => b.goals - a.goals || (b.assists ?? 0) - (a.assists ?? 0));
  if (list.length === 0) return null;
  return { competition: { id: appLeagueId, name: leagueName }, season: { name: String(season) }, topscorers: list };
}
