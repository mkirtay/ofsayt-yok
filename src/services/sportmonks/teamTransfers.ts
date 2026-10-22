/**
 * Takım sayfası "Transferler" sekmesi — `transfers/teams/{id}` (Transfer havuzu; `teams?include=transfers` yok).
 *
 * 2026-10-21 gerçek isteklerle (GS 34, FB 88, BJK 554) doğrulandı:
 * - Sıra `updated_at` (tarih değil) ve toplu güncellemeler eski kayıtları da öne alıyor → son 12 ayın tamamı ilk sayfada
 *   değil. GS: 1. sayfa (50) 23, 2. sayfa 9 satır son 12 aydan → azalıyor; en çok 2 sayfa (100 satır) okunur.
 * - İç içe include YOK ("more than 1 nested includes"): yalnız düz `player`, `fromTeam`, `toTeam`. Takımın ligi / oyuncunun
 *   maçları alınamıyor → gürültü süzgeci yalnız bu satırlardaki alanlarla.
 * - `completed` güvenilmez (çoğu false), `amount` nadir. Kiralık dönüşü (9688) planlanan dönüş tarihiyle önceden yazılıyor
 *   (2027-06-30) → tarihi bugünden sonra olan satır gösterilmez.
 * - Tür id'leri `core/types` ile (bkz. teamLoans.ts): 218 Loan, 219 Transfer, 220 Free Transfer, 9688 End of loan.
 *
 * Pencere: son 365 gün (bugün dahil). Ekim'de bu, son iki transfer dönemi demek (kış + yaz); dönem sınırları ülkeye
 * göre değiştiği için takvim dönemi yerine sabit pencere.
 *
 * Gürültü süzgeci (altyapı / ikinci takım hareketleri):
 * 1. Karşı takım altyapı / rezerv takımı (adında U19, U-21, II, "B" eki, Reserves, Youth, Primavera, Jong, Sub-20…) → at.
 *    (BJK'nın U19'dan A takıma aldıkları, GS'nin Gladbach U19'dan aldığı genç.)
 * 2. Bedelsiz yurt içi hareket — kiralık, kiralık dönüşü ya da serbest (218 / 9688 / 220, bedel yok, karşı takım aynı
 *    ülkeden) — ve oyuncu transfer tarihinde ≤ 21 yaşında → at. Altyapı oyuncularının alt lig kiralıkları bu kalıpta;
 *    yabancı kulüple kiralık (Jelert, Bitshiabu) ve bedelli satış/alış (Umut Erdem) kalır. Bilinen kayıp: A takımda
 *    süre almış 21 yaşındaki yurt içi kiralık (GS Eyüp Aydın) de elenir. Doğum tarihi yoksa yaş kuralı uygulanmaz.
 */
import { normalizeDisplayName } from '@/utils/displayName';

export const TRANSFER_TYPE_LOAN = 218;
export const TRANSFER_TYPE_PERMANENT = 219;
export const TRANSFER_TYPE_FREE = 220;
export const TRANSFER_TYPE_END_OF_LOAN = 9688;

/** Düz include'lar (iç içe yasak); alan seçimi yanıtı küçültür (GS 50 satır ≈ 43 KB ham). */
export const TEAM_TRANSFERS_INCLUDE =
  'player:display_name,image_path,date_of_birth;fromTeam:name,image_path,country_id;toTeam:name,image_path,country_id';
export const TEAM_TRANSFERS_PER_PAGE = 50;
export const TEAM_TRANSFERS_MAX_PAGES = 2;
export const TRANSFER_WINDOW_DAYS = 365;
/** Bu yaş ve altı + bedelsiz yurt içi hareket = altyapı gürültüsü. */
export const YOUTH_MAX_AGE = 21;

export type SportmonksTransferTeam = {
  id: number;
  country_id?: number | null;
  name?: string | null;
  image_path?: string | null;
};

export type SportmonksTeamTransferRow = {
  id: number;
  player_id?: number | null;
  type_id?: number | null;
  from_team_id?: number | null;
  to_team_id?: number | null;
  date?: string | null;
  amount?: number | null;
  player?: { id: number; display_name?: string | null; image_path?: string | null; date_of_birth?: string | null } | null;
  fromteam?: SportmonksTransferTeam | null;
  toteam?: SportmonksTransferTeam | null;
};

export type TransferKind = 'permanent' | 'loan' | 'loanReturn' | 'free';

export type TeamTransfer = {
  id: number;
  playerId: number;
  playerName: string;
  playerPhoto?: string;
  /** Karşı takım (gelende nereden, gidende nereye); Sportmonks "TBC" / yok → alan yok. */
  club?: { id: number; name: string; logo?: string };
  kind: TransferKind;
  /** YYYY-MM-DD */
  date: string;
  /** Bedel (€); yoksa alan yok. */
  fee?: number;
};

export type TeamTransfers = { incoming: TeamTransfer[]; outgoing: TeamTransfer[] };

const KIND_BY_TYPE: Record<number, TransferKind> = {
  [TRANSFER_TYPE_PERMANENT]: 'permanent',
  [TRANSFER_TYPE_LOAN]: 'loan',
  [TRANSFER_TYPE_END_OF_LOAN]: 'loanReturn',
  [TRANSFER_TYPE_FREE]: 'free',
};

export function transferKind(typeId: number | null | undefined): TransferKind | null {
  return typeId != null ? (KIND_BY_TYPE[typeId] ?? null) : null;
}

const YOUTH_TEAM = /(\bU-?\d{2}\b|\bSub-?\d{2}\b|\bII\b|\sB$|\bReserves?\b|\bYouth\b|\bPrimavera\b|\bJong\s|\bJuvenil|\bAkademi)/i;

export function isYouthTeamName(name: string | null | undefined): boolean {
  return Boolean(name && YOUTH_TEAM.test(name.trim()));
}

/** Tam yaş (YYYY-MM-DD iki tarih arasında); geçersizse null. */
export function ageOn(birth: string | null | undefined, on: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth ?? '');
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(on);
  if (!b || !d) return null;
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];
  const [dy, dm, dd] = [Number(d[1]), Number(d[2]), Number(d[3])];
  return dy - by - (dm < bm || (dm === bm && dd < bd) ? 1 : 0);
}

function shiftIso(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Gürültü mü (altyapı / ikinci takım hareketi) — bkz. dosya başı kural 1–2. */
export function isYouthNoise(
  row: SportmonksTeamTransferRow,
  own: SportmonksTransferTeam | null | undefined,
  other: SportmonksTransferTeam | null | undefined,
  kind: TransferKind,
): boolean {
  if (isYouthTeamName(other?.name)) return true;
  if (kind === 'permanent' || (row.amount ?? 0) > 0) return false;
  const domestic = own?.country_id != null && other?.country_id != null && own.country_id === other.country_id;
  if (!domestic) return false;
  const age = ageOn(row.player?.date_of_birth, row.date ?? '');
  return age != null && age <= YOUTH_MAX_AGE;
}

const isPlaceholderTeam = (name: string) => /^(tbc|tba|unknown|without club|no club)$/i.test(name);

/**
 * Ham satırlar → Gelenler / Gidenler (yeniden eskiye). Aynı satır iki sayfada gelirse tekil (id). Takımın kendisiyle
 * ilgisiz satır (ne gelen ne giden) ve tanınmayan tür atılır.
 */
export function mapTeamTransfers(rows: readonly SportmonksTeamTransferRow[], teamId: number, todayIso: string): TeamTransfers {
  const from = shiftIso(todayIso, -TRANSFER_WINDOW_DAYS);
  const seen = new Set<number>();
  const incoming: TeamTransfer[] = [];
  const outgoing: TeamTransfer[] = [];
  for (const row of rows) {
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    const date = row.date?.slice(0, 10) ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso || date < from) continue;
    const kind = transferKind(row.type_id);
    if (!kind) continue;
    const isIn = row.to_team_id === teamId;
    const isOut = row.from_team_id === teamId;
    if (isIn === isOut) continue;
    const own = isIn ? row.toteam : row.fromteam;
    const other = isIn ? row.fromteam : row.toteam;
    if (isYouthNoise(row, own, other, kind)) continue;
    const name = normalizeDisplayName(row.player?.display_name ?? '');
    const playerId = row.player?.id ?? row.player_id;
    if (!name || playerId == null) continue;
    const clubName = other?.name?.trim();
    const transfer: TeamTransfer = {
      id: row.id,
      playerId,
      playerName: name,
      ...(row.player?.image_path ? { playerPhoto: row.player.image_path } : {}),
      ...(other && clubName && !isPlaceholderTeam(clubName)
        ? { club: { id: other.id, name: clubName, ...(other.image_path ? { logo: other.image_path } : {}) } }
        : {}),
      kind,
      date,
      ...(typeof row.amount === 'number' && row.amount > 0 ? { fee: row.amount } : {}),
    };
    (isIn ? incoming : outgoing).push(transfer);
  }
  const byDate = (a: TeamTransfer, b: TeamTransfer) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1);
  return { incoming: incoming.sort(byDate), outgoing: outgoing.sort(byDate) };
}

/** € bedel: 25.000.000 → "€25 mn" (TR) / "€25M" (EN); 350.000 → "€350 bin" / "€350K". */
export function formatTransferFee(amount: number, locale: 'tr' | 'en'): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (amount >= 1_000_000) return locale === 'en' ? `€${fmt(amount / 1_000_000)}M` : `€${fmt(amount / 1_000_000)} mn`;
  if (amount >= 1_000) return locale === 'en' ? `€${fmt(amount / 1_000)}K` : `€${fmt(amount / 1_000)} bin`;
  return `€${fmt(amount)}`;
}
