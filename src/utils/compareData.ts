import { normalizeSearchText } from '@/utils/searchText';
import { isCupCompetition } from '@/services/playerProfile';

export type H2HRow = {
  date?: string;
  homeName: string;
  awayName: string;
  score: string;
  /** Skorun ev sahibi tarafı `team1` mi? */
  team1IsHome: boolean;
  winner: 'team1' | 'team2' | 'draw';
};

export type H2HSummary = {
  total: number;
  team1Wins: number;
  draws: number;
  team2Wins: number;
  /** En yeni önce. */
  rows: H2HRow[];
};

export const H2H_LIMIT = 10;

type RawH2H = { date?: string; scheduled?: string; home_name?: string; away_name?: string; score?: string };

const sameName = (a: string | undefined, b: string) => a != null && normalizeSearchText(a) === normalizeSearchText(b);

/**
 * `teams/head2head` satırlarından "Son N karşılaşma" özeti — `team1`/`team2` perspektifiyle. İsmi iki takımdan
 * birine eşlenemeyen veya skoru olmayan satır atlanır. Sonuç en yeniden eskiye, `limit` ile sınırlı.
 */
export function summarizeH2H(rows: RawH2H[] | undefined, team1Name: string, team2Name: string, limit = H2H_LIMIT): H2HSummary {
  const parsed: Array<H2HRow & { sort: string }> = [];
  for (const r of rows ?? []) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec((r.score ?? '').trim());
    if (!m || !r.home_name || !r.away_name) continue;
    const t1Home = sameName(r.home_name, team1Name) && sameName(r.away_name, team2Name);
    const t1Away = sameName(r.away_name, team1Name) && sameName(r.home_name, team2Name);
    if (!t1Home && !t1Away) continue;
    const hg = Number(m[1]);
    const ag = Number(m[2]);
    const t1Goals = t1Home ? hg : ag;
    const t2Goals = t1Home ? ag : hg;
    parsed.push({
      ...(r.date ? { date: r.date } : {}),
      homeName: r.home_name,
      awayName: r.away_name,
      score: `${hg}-${ag}`,
      team1IsHome: t1Home,
      winner: t1Goals > t2Goals ? 'team1' : t1Goals < t2Goals ? 'team2' : 'draw',
      sort: `${r.date ?? ''}${r.scheduled ?? ''}`,
    });
  }
  const latest = parsed.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, limit);
  const rowsOut: H2HRow[] = latest.map(({ sort: _sort, ...row }) => {
    void _sort;
    return row;
  });
  return {
    total: rowsOut.length,
    team1Wins: rowsOut.filter((r) => r.winner === 'team1').length,
    draws: rowsOut.filter((r) => r.winner === 'draw').length,
    team2Wins: rowsOut.filter((r) => r.winner === 'team2').length,
    rows: rowsOut,
  };
}

/** Takımın "güncel sezonu": son maçlarda en sık geçen KUPA OLMAYAN (lig) `season_id`; yoksa en sık geçen herhangi biri. */
export function pickCurrentSeasonId(matches: Array<{ season_id?: number; competition?: { name?: string } }>): number | null {
  const count = (list: typeof matches) => {
    const c = new Map<number, number>();
    for (const m of list) if (m.season_id != null) c.set(m.season_id, (c.get(m.season_id) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
  };
  return count(matches.filter((m) => !isCupCompetition(m.competition?.name))) ?? count(matches);
}

export type StatBarKind = 'percent' | 'count';

/**
 * Ortadan bölünmüş bar genişlikleri (her yarı için % ). `percent`: değerler 0..1 oran → 0–100 skala.
 * `count`: iki değerin toplamına oranla (eşitse ikisi de %50; biri 0 ise diğeri %100).
 */
export function statBarWidths(v1: number, v2: number, kind: StatBarKind): { left: number; right: number } {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  if (kind === 'percent') return { left: clamp(v1 * 100), right: clamp(v2 * 100) };
  const sum = v1 + v2;
  if (!(sum > 0)) return { left: 0, right: 0 };
  return { left: clamp((v1 / sum) * 100), right: clamp((v2 / sum) * 100) };
}
