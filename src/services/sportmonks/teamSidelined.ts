/**
 * Sakat ve cezalı oyuncular — `sidelined.player;sidelined.type` include'u takım sezon istatistikleri isteğine eklenir
 * (bkz. teamSeasonStats.ts; tek istek, 2026-10-02'de GS ile birleşik istek doğrulandı).
 *
 * Sportmonks takımın sakatlık/ceza GEÇMİŞİNİ döndürür: yalnız `completed=false` ve bitiş tarihi geçmemiş (ya da
 * açık uçlu) kayıtlar gösterilir. `NO_ELIGIBILITY` ("uygun değil") kaydı sakatlık/ceza değildir — UEFA kadro
 * listesine yazılmamış oyuncu (GS 2026-10-02: 11 kaydın 7'si); listeye girmez, oyuncu sayısı ayrı not olarak verilir.
 */

export type SportmonksSidelinedRow = {
  id: number;
  player_id: number;
  category?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  games_missed?: number | null;
  completed?: boolean | null;
  player?: { id: number; display_name?: string | null; common_name?: string | null; name?: string | null; image_path?: string | null } | null;
  type?: { id: number; name?: string | null; developer_name?: string | null } | null;
};

export const NO_ELIGIBILITY = 'NO_ELIGIBILITY';

export type SidelinedReason = { category: 'injury' | 'suspended' | 'other'; code: string; name: string };

export type SidelinedPlayer = {
  playerId: number;
  name: string;
  photo?: string;
  /** Oyuncunun süren kayıtları (ör. sakatlık + kırmızı kart cezası). */
  reasons: SidelinedReason[];
  /** En geç dönüş tarihi (YYYY-MM-DD); açık uçlu kayıt varsa yok. */
  until?: string;
};

export type TeamSidelined = { players: SidelinedPlayer[]; notInUefaSquad: number };

function category(raw: string | null | undefined): SidelinedReason['category'] {
  const c = (raw ?? '').toLowerCase();
  if (c === 'injury') return 'injury';
  if (c === 'suspended' || c === 'suspension') return 'suspended';
  return 'other';
}

function isActive(row: SportmonksSidelinedRow, todayIso: string): boolean {
  if (row.completed === true) return false;
  const end = row.end_date?.slice(0, 10);
  return !end || end >= todayIso;
}

/** @param todayIso TR günü (YYYY-MM-DD) — bitiş tarihi bugünden önce olan kayıt elenir. */
export function mapTeamSidelined(rows: SportmonksSidelinedRow[] | null | undefined, todayIso: string): TeamSidelined {
  const ineligible = new Set<number>();
  const byPlayer = new Map<number, SidelinedPlayer & { openEnded: boolean }>();
  for (const row of rows ?? []) {
    if (!row?.player_id || !isActive(row, todayIso)) continue;
    const code = row.type?.developer_name ?? '';
    if (code === NO_ELIGIBILITY) {
      ineligible.add(row.player_id);
      continue;
    }
    const reason: SidelinedReason = { category: category(row.category), code, name: row.type?.name?.trim() || code };
    const end = row.end_date?.slice(0, 10);
    const p = row.player;
    const prev = byPlayer.get(row.player_id);
    if (prev) {
      if (!prev.reasons.some((r) => r.code === reason.code)) prev.reasons.push(reason);
      if (!end) prev.openEnded = true;
      else if (!prev.until || end > prev.until) prev.until = end;
      continue;
    }
    byPlayer.set(row.player_id, {
      playerId: row.player_id,
      name: (p?.display_name || p?.common_name || p?.name || '').trim().replace(/\s+/g, ' '),
      ...(p?.image_path ? { photo: p.image_path } : {}),
      reasons: [reason],
      ...(end ? { until: end } : {}),
      openEnded: !end,
    });
  }
  const rank = (p: SidelinedPlayer) => (p.reasons.some((r) => r.category === 'injury') ? 0 : 1);
  const players: SidelinedPlayer[] = [...byPlayer.values()]
    .map(({ openEnded, until, ...p }): SidelinedPlayer => (openEnded || !until ? p : { ...p, until }))
    .sort((a, b) => rank(a) - rank(b) || (a.until ?? '9999').localeCompare(b.until ?? '9999') || a.name.localeCompare(b.name, 'tr'));
  return { players, notInUefaSquad: ineligible.size };
}
