/**
 * Hakem sezon istatistikleri — `GET /referees/{id}?include=statistics.details.type;statistics.season`
 * (2026-10-04 gerçek istekle doğrulandı, B. Kolak 62331: 9 sezon kaydı, her biri `season.league_id` + `is_current`).
 * Detay değerleri iki biçimde: `{count, average}` (FOULS, MATCHES, VAR_MOMENTS) ya da `{all:{count,average}, home, away}`
 * (YELLOWCARDS, REDCARDS, PENALTIES). Maç başı değer burada sayıdan hesaplanır (Sportmonks ortalamasına güvenilmez).
 * Yalnız sayı; yorum yok (maç sayfası kartı ve AI bağlamı aynı özeti kullanır).
 */

export type RefereeSeasonLine = {
  seasonId: number;
  /** "2026/2027" */
  seasonName: string;
  matches: number;
  yellowPerMatch: number | null;
  redPerMatch: number | null;
  penaltiesPerMatch: number | null;
  foulsPerMatch: number | null;
  varPerMatch: number | null;
};

export type RefereeSummary = {
  refereeId: number;
  name: string;
  /** Maçın sezonu (bu sezon); hakemin bu sezon kaydı yoksa `matches: 0` ile yine döner. */
  current: RefereeSeasonLine;
  /** Bu sezon 5 maçtan azsa aynı ligin bir önceki sezonu (varsa). */
  previous: RefereeSeasonLine | null;
};

/** Bu sezon bu kadar maçtan azsa geçen sezon da gösterilir. */
export const REFEREE_FEW_MATCHES = 5;

type RawDetail = { value?: unknown; type?: { developer_name?: string } | null };
type RawSeasonStat = {
  season_id?: number;
  season?: { id?: number; name?: string; league_id?: number; starting_at?: string | null; is_current?: boolean } | null;
  details?: RawDetail[] | null;
};
export type RawReferee = { id?: number; common_name?: string; display_name?: string; name?: string; statistics?: RawSeasonStat[] | null };

function countOf(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { count?: unknown; all?: { count?: unknown } };
  const c = v.all && typeof v.all === 'object' ? v.all.count : v.count;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
}

function perMatch(count: number | null, matches: number): number | null {
  if (count == null || matches <= 0) return null;
  return Math.round((count / matches) * 100) / 100;
}

export function seasonLine(stat: RawSeasonStat | undefined, seasonId: number, fallbackName: string): RefereeSeasonLine {
  const byType = new Map<string, unknown>();
  for (const d of stat?.details ?? []) {
    const key = d.type?.developer_name;
    if (key) byType.set(key, d.value);
  }
  const matches = countOf(byType.get('MATCHES')) ?? 0;
  return {
    seasonId,
    seasonName: stat?.season?.name ?? fallbackName,
    matches,
    yellowPerMatch: perMatch(countOf(byType.get('YELLOWCARDS')), matches),
    redPerMatch: perMatch(countOf(byType.get('REDCARDS')), matches),
    penaltiesPerMatch: perMatch(countOf(byType.get('PENALTIES')), matches),
    foulsPerMatch: perMatch(countOf(byType.get('FOULS')), matches),
    varPerMatch: perMatch(countOf(byType.get('VAR_MOMENTS')), matches),
  };
}

/**
 * @param seasonId maçın sezonu (`Match.season_id`)
 * @param leagueId maçın ligi — geçen sezon aynı ligde aranır; yoksa bilinmiyor (geçen sezon gösterilmez)
 */
export function summarizeRefereeStats(raw: RawReferee | null | undefined, seasonId: number, leagueId: number | null): RefereeSummary | null {
  if (!raw?.id) return null;
  const stats = raw.statistics ?? [];
  const cur = stats.find((s) => (s.season_id ?? s.season?.id) === seasonId);
  const current = seasonLine(cur, seasonId, '');
  let previous: RefereeSeasonLine | null = null;
  if (current.matches < REFEREE_FEW_MATCHES && leagueId != null) {
    const curStart = cur?.season?.starting_at ?? null;
    const curName = cur?.season?.name ?? null;
    const earlier = stats
      .filter((s) => s.season?.league_id === leagueId && (s.season_id ?? s.season?.id) !== seasonId)
      .filter((s) => (curStart && s.season?.starting_at ? s.season.starting_at < curStart : curName && s.season?.name ? s.season.name < curName : true))
      .sort((a, b) => String(b.season?.starting_at ?? b.season?.name ?? '').localeCompare(String(a.season?.starting_at ?? a.season?.name ?? '')));
    const prev = earlier[0];
    if (prev) {
      const line = seasonLine(prev, prev.season_id ?? prev.season?.id ?? 0, '');
      if (line.matches > 0) previous = line;
    }
  }
  return {
    refereeId: raw.id,
    name: raw.display_name ?? raw.common_name ?? raw.name ?? '',
    current,
    previous,
  };
}

/** AI bağlamı için tek satır (yalnız sayılar). */
export function refereeSummaryPromptLines(s: RefereeSummary): string[] {
  const fmt = (n: number | null) => (n == null ? '—' : n.toFixed(2).replace(/\.?0+$/, ''));
  const line = (l: RefereeSeasonLine, label: string) =>
    `${label} (${l.seasonName || 'sezon'}): ${l.matches} maç | maç başı sarı ${fmt(l.yellowPerMatch)}, kırmızı ${fmt(l.redPerMatch)}, ` +
    `penaltı ${fmt(l.penaltiesPerMatch)}, faul ${fmt(l.foulsPerMatch)}, VAR incelemesi ${fmt(l.varPerMatch)}`;
  const out = [`Hakem istatistikleri — ${s.name}`, line(s.current, 'Bu sezon')];
  if (s.previous) out.push(line(s.previous, 'Geçen sezon'));
  return out;
}

export type RefereeSeasonTableRow = RefereeSeasonLine & { leagueId: number | null; startingAt: string | null };

/** Hakem sayfası sezon tablosu: lig × sezon, maçı olan satırlar; yeni sezon önce. */
export function refereeSeasonTable(raw: RawReferee | null | undefined): RefereeSeasonTableRow[] {
  return (raw?.statistics ?? [])
    .map((s) => ({
      ...seasonLine(s, s.season_id ?? s.season?.id ?? 0, ''),
      leagueId: s.season?.league_id ?? null,
      startingAt: s.season?.starting_at ?? null,
    }))
    .filter((r) => r.matches > 0)
    .sort((a, b) => String(b.startingAt ?? b.seasonName).localeCompare(String(a.startingAt ?? a.seasonName)) || (a.leagueId ?? 0) - (b.leagueId ?? 0));
}

/** Bu sezonun (her ligde `is_current`) sezon id'leri. */
export function currentSeasonIds(raw: RawReferee | null | undefined): number[] {
  return (raw?.statistics ?? []).filter((s) => s.season?.is_current).map((s) => s.season_id ?? s.season?.id ?? 0).filter(Boolean);
}
