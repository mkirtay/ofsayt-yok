/**
 * Kiralıktaki oyuncular (takım sayfası Kadro sekmesi) — `squads/teams/{id}/extended` (Player havuzu, tek istek).
 *
 * `extended` güncel kadroya (`in_squad=true`) ek olarak takımla bağı süren/sürmüş oyuncuları da döndürür (GS
 * 2026-10-21: 57 = 32 + 25). Bu 25'in çoğu KİRALIK DEĞİL: kalıcı ayrılanlar (Icardi, Mertens), kiralık dönüşü
 * başka kulübe dönenler (Boey, Asprilla), başka kulübün oyuncusu olup başka yere kiralananlar (Morata), altyapı.
 * Satırda kiralık bayrağı yok → oyuncunun transfer geçmişinden (`include=transfers`) türetilir:
 *
 * Kiralık sayılır ⇔ bugüne kadarki SON transferi `LOAN_TRANSFER` (218) ve bu takımdan başka bir kulübe; sonrasında
 * (bugünden önce) bitmiş kiralık dönüşü / satış yok. Dönüş tarihi varsa aynı kulüpten bu takıma `END_OF_LOAN` (9688).
 * Kiralık tarihi 2 yıldan eskiyse (dönüş kaydı eksik bayat veri) gösterilmez. Kalıcı ayrılanlar listeye girmez
 * (takımla sözleşmesi yok). Tür id'leri `core/types` ile doğrulandı: 218 Loan, 219 Transfer, 220 Free Transfer,
 * 9688 End of loan. `completed` alanı güvenilmez (GS'nin süren kiralıklarının bir kısmında false) → kullanılmaz.
 */
import { normalizeDisplayName } from '@/utils/displayName';

export const TRANSFER_TYPE_LOAN = 218;
export const TRANSFER_TYPE_END_OF_LOAN = 9688;

/** Transfer satırı + gidilen kulübün adı/logosu (alan seçimi: yanıt ~127 KB, gzip ~13 KB; GS 2026-10-21). */
export const TEAM_LOANS_INCLUDE =
  'transfers:player_id,from_team_id,to_team_id,date,type_id;transfers.toTeam:name,image_path';

/** Kiralık kaydı en çok bu kadar eski olabilir (dönüş kaydı olmayan bayat veriyi elemek için). */
export const MAX_LOAN_AGE_DAYS = 730;

export type SportmonksExtendedTransfer = {
  id: number;
  player_id?: number | null;
  from_team_id?: number | null;
  to_team_id?: number | null;
  date?: string | null;
  type_id?: number | null;
  toteam?: { id: number; name?: string | null; image_path?: string | null } | null;
};

export type SportmonksExtendedSquadRow = {
  id: number;
  display_name?: string | null;
  common_name?: string | null;
  name?: string | null;
  image_path?: string | null;
  position_id?: number | null;
  detailed_position_id?: number | null;
  in_squad?: boolean | null;
  transfers?: SportmonksExtendedTransfer[] | null;
};

export type LoanedPlayer = {
  id: number;
  name: string;
  photo?: string;
  positionId?: number;
  detailedPositionId?: number;
  club: { id: number; name: string; logo?: string };
  /** Kiralık başlangıcı (YYYY-MM-DD). */
  since: string;
  /** Planlanan dönüş (YYYY-MM-DD); Sportmonks'ta yoksa yok. */
  until?: string;
};

/** Mevki sırası: kaleci, defans, orta saha, forvet (position_id 24–27), bilinmeyen sonda. */
function positionRank(id: number | null | undefined): number {
  return id != null && id >= 24 && id <= 27 ? id - 24 : 9;
}

function day(iso: string | null | undefined): string | null {
  const d = iso?.slice(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

/** Kadro dışı tek oyuncu → süren kiralık (yoksa null). */
export function activeLoan(row: SportmonksExtendedSquadRow, teamId: number, todayIso: string): LoanedPlayer | null {
  if (row.in_squad === true || !row.id) return null;
  const past = (row.transfers ?? [])
    .map((t) => ({ t, d: day(t.date) }))
    .filter((x): x is { t: SportmonksExtendedTransfer; d: string } => x.d != null && x.d <= todayIso)
    .sort((a, b) => (a.d === b.d ? a.t.id - b.t.id : a.d < b.d ? -1 : 1));
  const last = past[past.length - 1];
  if (!last) return null;
  const { t, d: since } = last;
  if (t.type_id !== TRANSFER_TYPE_LOAN || t.from_team_id !== teamId || !t.to_team_id || t.to_team_id === teamId) return null;
  if (daysBetween(since, todayIso) > MAX_LOAN_AGE_DAYS) return null;
  const clubName = t.toteam?.name?.trim();
  if (!clubName) return null;

  const until = (row.transfers ?? [])
    .filter((r) => r.type_id === TRANSFER_TYPE_END_OF_LOAN && r.from_team_id === t.to_team_id && r.to_team_id === teamId)
    .map((r) => day(r.date))
    .filter((x): x is string => x != null && x > since)
    .sort()[0];

  const name = normalizeDisplayName(row.display_name || row.common_name || row.name || '').trim();
  if (!name) return null;
  return {
    id: row.id,
    name,
    ...(row.image_path ? { photo: row.image_path } : {}),
    ...(row.position_id != null ? { positionId: row.position_id } : {}),
    ...(row.detailed_position_id != null ? { detailedPositionId: row.detailed_position_id } : {}),
    club: { id: t.to_team_id, name: clubName, ...(t.toteam?.image_path ? { logo: t.toteam.image_path } : {}) },
    since,
    ...(until ? { until } : {}),
  };
}

/** @param todayIso TR günü (YYYY-MM-DD). Mevki sırasına, sonra ada göre. */
export function mapTeamLoans(
  rows: SportmonksExtendedSquadRow[] | null | undefined,
  teamId: number,
  todayIso: string,
): LoanedPlayer[] {
  const out: LoanedPlayer[] = [];
  for (const row of rows ?? []) {
    const loan = row ? activeLoan(row, teamId, todayIso) : null;
    if (loan) out.push(loan);
  }
  return out.sort((a, b) => positionRank(a.positionId) - positionRank(b.positionId) || a.name.localeCompare(b.name, 'tr'));
}
