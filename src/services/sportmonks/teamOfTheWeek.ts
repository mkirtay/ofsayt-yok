/**
 * Haftanın Takımı (Sportmonks `team-of-the-week/leagues/{id}/latest`) — ham satırlar → saha dizilişi.
 *
 * Yanıt (2026-10-21 doğrulandı: 600, 8, 564, 82, 384, 2): 11 satır {player_id, team_id, fixture_id, round_id, rating,
 * formation ("4-4-2"), formation_position 1..11}; include `player`, `team`, `round` + alan seçimi çalışıyor. Ayrı
 * havuz (`requested_entity: TeamOfTheWeek`) — Fixture kotasını yemez.
 *
 * `formation_position`: 1 kaleci, sonra her hat kendi içinde takımın SAĞINDAN SOLUNA (2 = sağ bek … 5 = sol bek),
 * savunmadan forvete. "latest" bazı liglerde haftalarca geride kalabiliyor (La Liga: 9. hafta oynandı, latest 7.
 * hafta) → tur bitişi `TOTW_MAX_AGE_DAYS`'ten eskiyse "yok" sayılır (bir ay önceki 11'i "haftanın" diye göstermeyelim).
 */

/** Tek istek: oyuncu adı/fotoğrafı, takım adı/logosu, tur adı/tarihleri (alan seçimiyle ~7 KB). */
export const TOTW_INCLUDE =
  'player:display_name,common_name,image_path;team:name,short_code,image_path;round:name,season_id,starting_at,ending_at';

/** Tur bitişinden bu kadar gün sonra liste gösterilmez. */
export const TOTW_MAX_AGE_DAYS = 21;

export type RawTotwRow = {
  id?: number;
  player_id?: number | null;
  team_id?: number | null;
  fixture_id?: number | null;
  round_id?: number | null;
  rating?: number | string | null;
  formation?: string | null;
  formation_position?: number | null;
  player?: { id?: number; display_name?: string | null; common_name?: string | null; image_path?: string | null; position_id?: number | null } | null;
  team?: { id?: number; name?: string | null; short_code?: string | null; image_path?: string | null } | null;
  round?: { id?: number; name?: string | null; season_id?: number | null; starting_at?: string | null; ending_at?: string | null } | null;
};

export type TotwPlayer = {
  /** 1..11 (`formation_position`). */
  position: number;
  playerId: number | null;
  name: string;
  /** Saha üstü kısa ad ("A. Gianniotis"); yoksa `name`. */
  shortName: string;
  photo: string | null;
  teamId: number | null;
  teamName: string | null;
  teamShortCode: string | null;
  teamLogo: string | null;
  rating: number | null;
  fixtureId: number | null;
};

export type TeamOfTheWeek = {
  leagueId: number;
  formation: string;
  round: { id: number | null; name: string | null; seasonId: number | null; startingAt: string | null; endingAt: string | null };
  players: TotwPlayer[];
};

const SPORTMONKS_PLACEHOLDER = /placeholder/i;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** "4-4-2" → [4,4,2]; toplam 10 değilse null. */
export function parseFormation(formation: string | null | undefined): number[] | null {
  if (!formation || !/^\d(-\d){1,4}$/.test(formation.trim())) return null;
  const lines = formation.trim().split('-').map(Number);
  return lines.every((n) => n > 0) && lines.reduce((a, b) => a + b, 0) === 10 ? lines : null;
}

/**
 * @returns 11 oyuncu ve geçerli formasyon yoksa ya da tur `maxAgeDays`'ten eskiyse null ("bu lig için yok").
 */
export function mapTeamOfTheWeek(
  leagueId: number,
  rows: RawTotwRow[] | null | undefined,
  now: number = Date.now(),
  maxAgeDays: number = TOTW_MAX_AGE_DAYS,
): TeamOfTheWeek | null {
  if (!Array.isArray(rows) || rows.length !== 11) return null;
  const formation = str(rows[0]?.formation);
  if (!parseFormation(formation) || rows.some((r) => str(r.formation) !== formation)) return null;

  const players: TotwPlayer[] = [];
  for (const r of rows) {
    const position = num(r.formation_position);
    const name = str(r.player?.display_name) ?? str(r.player?.common_name);
    if (position == null || position < 1 || position > 11 || !name) return null;
    const photo = str(r.player?.image_path);
    players.push({
      position,
      playerId: num(r.player_id),
      name,
      shortName: str(r.player?.common_name) ?? name,
      photo: photo && !SPORTMONKS_PLACEHOLDER.test(photo) ? photo : null,
      teamId: num(r.team_id),
      teamName: str(r.team?.name),
      teamShortCode: str(r.team?.short_code),
      teamLogo: str(r.team?.image_path),
      rating: num(r.rating),
      fixtureId: num(r.fixture_id),
    });
  }
  if (new Set(players.map((p) => p.position)).size !== 11) return null;
  players.sort((a, b) => a.position - b.position);

  const raw = rows.find((r) => r.round)?.round ?? null;
  const round = {
    id: num(raw?.id) ?? num(rows[0]?.round_id),
    name: str(raw?.name),
    seasonId: num(raw?.season_id),
    startingAt: str(raw?.starting_at),
    endingAt: str(raw?.ending_at),
  };
  const end = round.endingAt ?? round.startingAt;
  if (end) {
    const endMs = Date.parse(`${end.slice(0, 10)}T23:59:59Z`);
    if (Number.isFinite(endMs) && now - endMs > maxAgeDays * 86_400_000) return null;
  }
  return { leagueId, formation: formation!, round, players };
}

/**
 * Saha satırları — ÜSTTEN alta (forvet → kaleci), her satır ekranda soldan sağa (takım hücum yönü yukarı: takımın
 * solu ekranın solu). Sportmonks hat içinde sağdan sola sıraladığı için satırlar ters çevrilir.
 */
export function buildTotwRows(totw: Pick<TeamOfTheWeek, 'formation' | 'players'>): TotwPlayer[][] {
  const lines = parseFormation(totw.formation);
  const sorted = [...totw.players].sort((a, b) => a.position - b.position);
  if (!lines || sorted.length !== 11) return [];
  const rows: TotwPlayer[][] = [sorted.slice(0, 1)];
  let i = 1;
  for (const n of lines) {
    rows.push(sorted.slice(i, i + n).reverse());
    i += n;
  }
  return rows.reverse();
}

/** "2026-10-09" + "2026-10-12" → "9–12 Eki" / "28 Eyl – 1 Eki" (yerel kısa ay). */
export function formatTotwDateRange(start: string | null, end: string | null, locale: string): string | null {
  const parse = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(`${d.slice(0, 10)}T12:00:00Z`) : null);
  const a = parse(start);
  const b = parse(end) ?? a;
  if (!a || !b) return null;
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
  if (a.getTime() === b.getTime()) return `${day(a)} ${month(a)}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${day(a)}–${day(b)} ${month(b)}`;
  return `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`;
}
