/**
 * Hakem sayfası takım kırılımı: hakemin yönettiği maçlardan takım başına maç sayısı, o takımın oyuncularına gösterilen
 * sarı / kırmızı kart ve o takım lehine verilen penaltı. Yalnız sayı; sıralama YALNIZ maç sayısına göre.
 *
 * Kaynak `fixtures/multi` (participants + scores + events:type_id,participant_id). Olay türleri (core/types, 2026-10-04):
 * 16 PENALTY (atılan penaltı golü), 17 MISSED_PENALTY, 19 YELLOWCARD, 20 REDCARD, 21 YELLOWREDCARD. Penaltı atışları
 * (22 / 23) sayılmaz. İkinci sarıdan kırmızı (21) kırmızı karta sayılır.
 */
export const EVENT_TYPE = { PENALTY: 16, MISSED_PENALTY: 17, YELLOW: 19, RED: 20, YELLOW_RED: 21 } as const;

export type BreakdownFixture = {
  id: number;
  season_id?: number | null;
  state_id?: number | null;
  participants?: { id: number; name?: string; image_path?: string | null }[] | null;
  events?: { type_id?: number | null; participant_id?: number | null }[] | null;
};

export type TeamBreakdownRow = {
  teamId: number;
  name: string;
  logo?: string;
  matches: number;
  yellow: number;
  red: number;
  penaltiesFor: number;
};

export function refereeTeamBreakdown(fixtures: readonly BreakdownFixture[]): TeamBreakdownRow[] {
  const rows = new Map<number, TeamBreakdownRow>();
  for (const f of fixtures) {
    for (const p of f.participants ?? []) {
      if (!rows.has(p.id)) rows.set(p.id, { teamId: p.id, name: p.name ?? '', ...(p.image_path ? { logo: p.image_path } : {}), matches: 0, yellow: 0, red: 0, penaltiesFor: 0 });
      rows.get(p.id)!.matches += 1;
    }
    for (const e of f.events ?? []) {
      const row = e.participant_id != null ? rows.get(e.participant_id) : undefined;
      if (!row) continue;
      if (e.type_id === EVENT_TYPE.YELLOW) row.yellow += 1;
      else if (e.type_id === EVENT_TYPE.RED || e.type_id === EVENT_TYPE.YELLOW_RED) row.red += 1;
      else if (e.type_id === EVENT_TYPE.PENALTY || e.type_id === EVENT_TYPE.MISSED_PENALTY) row.penaltiesFor += 1;
    }
  }
  // Yalnız maç sayısı; eşitlikte ada göre (kart sayısı sıralamaya girmez).
  return [...rows.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'tr'));
}
