/**
 * API-Football `fixtures?id=` cevabı → sağlayıcıdan bağımsız `Match` / `MatchEvent` / `MatchStatsData` / `MatchLineupData`.
 * Saf fonksiyonlar (ağ yok). Eşleme tabloları ve tuzaklar: docs/API_FOOTBALL_MIGRATION.md §1/§3, __fixtures__/README.md.
 *
 * Tuzaklar (gerçek cevaplarla doğrulandı):
 * - `subst` olayında `player` = ÇIKAN, `assist` = GİREN (Sportmonks'ta tersi) → uygulamada `player` = giren, `related_player` = çıkan.
 * - `grid "satır:sütun"`: sütun 1 = takımın KENDİ sol kanadı (her iki takımda; Kayode=RB 2:4, Ruggeri=LB 2:1). Uygulamanın saha çizimi
 *   (components/Lineup) sütunu artan sırada dizer ve deplasmanı ters çevirir; ekranda sol kanadın doğru yana düşmesi için
 *   HER İKİ takımda satır içinde aynalanır (görsel doğrulandı: Türkiye 3-4-3 / İtalya 4-3-3, 2026-11-10).
 * - Olaylarda id yok; ek dakika `time.extra` (90+8) ve olaylar sırasız gelir → (dakika+ek) ile sıralanır.
 * - Seri penaltı: aynı satırlar tekrar tekrar gelir; dakika 120 + `extra` = atış sırası → tekilleştirilir, SHOOTOUT olayına çevrilir.
 * - Skor: `goals` = penaltılar hariç son skor (uzatma dahil); `score.*` alt turlarda olaylarla çelişebilir → özet için `goals`.
 * - Tüm id'ler 2e9 kaydırılır (bkz. ids.ts). Forma rengi / xG / hava / TV / hakem id'si milli maçta yok → alan eklenmez.
 */
import type { Match, MatchStateCode } from '@/models/liveScore';
import type { LineupPlayer, LineupTeam, MatchEvent, MatchLineupData, MatchStatsData } from '@/models/domain';
import { normalizeDisplayName, normalizeTeamName } from '@/utils/displayName';
import { toAppId } from './ids';
import type { AfEvent, AfFixture, AfGoals, AfLineup, AfLineupPlayer, AfPlayersBlock, AfStatistics } from './types';

export type NationalMatchBundle = {
  match: Match;
  events: MatchEvent[];
  stats: MatchStatsData | null;
  lineups: MatchLineupData | null;
};

type Bucket = 'NOT STARTED' | 'IN PLAY' | 'HALF TIME BREAK' | 'FINISHED';

const STATUS: Record<string, { bucket: Bucket; code?: MatchStateCode }> = {
  TBD: { bucket: 'NOT STARTED', code: 'TBA' },
  NS: { bucket: 'NOT STARTED' },
  '1H': { bucket: 'IN PLAY' },
  HT: { bucket: 'HALF TIME BREAK' },
  '2H': { bucket: 'IN PLAY' },
  ET: { bucket: 'IN PLAY' },
  BT: { bucket: 'HALF TIME BREAK' },
  P: { bucket: 'IN PLAY' },
  SUSP: { bucket: 'NOT STARTED', code: 'SUSPENDED' },
  INT: { bucket: 'NOT STARTED', code: 'INTERRUPTED' },
  FT: { bucket: 'FINISHED' },
  AET: { bucket: 'FINISHED' },
  PEN: { bucket: 'FINISHED' },
  PST: { bucket: 'NOT STARTED', code: 'POSTPONED' },
  CANC: { bucket: 'FINISHED', code: 'CANCELLED' },
  ABD: { bucket: 'FINISHED', code: 'ABANDONED' },
  AWD: { bucket: 'FINISHED', code: 'AWARDED' },
  WO: { bucket: 'FINISHED', code: 'WALKOVER' },
  LIVE: { bucket: 'IN PLAY' },
};

const pair = (g: AfGoals | undefined | null): string | undefined =>
  g && g.home != null && g.away != null ? `${g.home}-${g.away}` : undefined;

function mapScores(f: AfFixture, bucket: Bucket): Match['scores'] | undefined {
  if (bucket === 'NOT STARTED') return undefined;
  const score = pair(f.goals);
  if (!score) return undefined;
  const ht = pair(f.score.halftime);
  const ft = pair(f.score.fulltime);
  const et = pair(f.score.extratime);
  const ps = pair(f.score.penalty);
  return {
    score,
    ...(ht ? { ht_score: ht } : {}),
    ...(ft || score ? { ft_score: ft ?? score } : {}),
    ...(et ? { et_score: et } : {}),
    ...(ps ? { ps_score: ps } : {}),
  };
}

function countRedCards(events: AfEvent[] | null | undefined, homeId: number, awayId: number): { home: number; away: number } {
  const out = { home: 0, away: 0 };
  for (const e of dedupeEvents(events ?? [])) {
    // "Red Card" + "Second Yellow card" (ikinci sarıdan kırmızı) sayılır.
    if (e.type !== 'Card' || !/red|second yellow/i.test(e.detail)) continue;
    if (e.team.id === homeId) out.home++;
    else if (e.team.id === awayId) out.away++;
  }
  return out;
}

export function mapNationalMatch(f: AfFixture): Match {
  const st = STATUS[f.fixture.status.short] ?? { bucket: 'NOT STARTED' as Bucket };
  const iso = new Date(f.fixture.date);
  const valid = !Number.isNaN(iso.getTime());
  const homeId = f.teams.home.id;
  const awayId = f.teams.away.id;
  const scores = mapScores(f, st.bucket);
  const { elapsed, extra } = f.fixture.status;
  const time = st.bucket === 'IN PLAY' && elapsed != null ? `${elapsed}${extra ? `+${extra}` : ''}'` : '';
  const venue = f.fixture.venue;
  const venueName = venue?.name?.trim();
  const venueCity = venue?.city?.trim();
  const redCards = countRedCards(f.events, homeId, awayId);
  const coachHome = coachName(f.lineups, homeId);
  const coachAway = coachName(f.lineups, awayId);
  const short = f.fixture.status.short;
  const finish = short === 'AET' ? 'AET' : short === 'PEN' ? 'PEN' : undefined;
  const referee = f.fixture.referee?.split(',')[0]?.trim();
  const round = f.league.round?.trim();

  return {
    id: toAppId(f.fixture.id),
    status: st.bucket,
    ...(st.code ? { state_code: st.code } : {}),
    time,
    home: { id: toAppId(homeId), name: normalizeTeamName(f.teams.home.name), ...(f.teams.home.logo ? { logo: f.teams.home.logo } : {}) },
    away: { id: toAppId(awayId), name: normalizeTeamName(f.teams.away.name), ...(f.teams.away.logo ? { logo: f.teams.away.logo } : {}) },
    ...(valid ? { date: iso.toISOString().slice(0, 10), scheduled: iso.toISOString().slice(11, 16) } : {}),
    ...(scores ? { scores } : {}),
    ...(venueName ? { location: venueCity ? `${venueName}, ${venueCity}` : venueName } : {}),
    ...(venueName ? { venue_info: { name: venueName, ...(venueCity ? { city: venueCity } : {}) } } : {}),
    ...(referee ? { referee } : {}),
    competition: { id: toAppId(f.league.id), name: f.league.name, ...(f.league.logo ? { logo: f.league.logo } : {}), is_cup: true, is_league: false },
    ...(round ? { stage: round } : {}),
    ...(finish ? { finish } : {}),
    ...(redCards.home + redCards.away > 0 ? { red_cards: redCards } : {}),
    ...(coachHome || coachAway ? { coaches: { ...(coachHome ? { home: coachHome } : {}), ...(coachAway ? { away: coachAway } : {}) } } : {}),
  };
}

function coachName(lineups: AfLineup[] | null | undefined, teamId: number): string | undefined {
  const n = lineups?.find((l) => l.team.id === teamId)?.coach?.name?.trim();
  return n ? (normalizeDisplayName(n) as string) : undefined;
}

// ── Olaylar ─────────────────────────────────────────────────────────────────

/** Aynı (dakika, ek, takım, oyuncu, tür, detay, asist) satırı bir kez — bozuk seri penaltı tekrarları. */
export function dedupeEvents(events: AfEvent[]): AfEvent[] {
  const seen = new Set<string>();
  const out: AfEvent[] = [];
  for (const e of events) {
    const k = [e.time.elapsed, e.time.extra, e.team.id, e.player.id ?? e.player.name, e.type, e.detail, e.assist.id ?? e.assist.name].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function eventLabel(e: AfEvent, shootout: boolean): string | null {
  const d = e.detail.toLowerCase();
  if (e.type === 'Goal') {
    if (d.includes('missed')) return shootout ? 'PENALTY_SHOOTOUT_MISS' : 'MISSED_PENALTY';
    if (d.includes('own')) return 'OWN_GOAL';
    if (d.includes('penalty')) return shootout ? 'PENALTY_SHOOTOUT_GOAL' : 'PENALTY';
    if (d.includes('goal')) return 'GOAL';
    return null;
  }
  if (e.type === 'Card') {
    if (d.includes('second yellow')) return 'YELLOW_RED_CARD';
    if (d.includes('red')) return 'RED_CARD';
    if (d.includes('yellow')) return 'YELLOW_CARD';
    return null;
  }
  if (e.type === 'subst') return 'SUBSTITUTION';
  if (e.type === 'Var') return 'VAR';
  return null;
}

export function mapNationalEvents(f: AfFixture): MatchEvent[] {
  const status = f.fixture.status.short;
  const hasET = f.score.extratime?.home != null;
  const shootoutFrom = status === 'PEN' ? (hasET ? 120 : 90) : Infinity;
  const homeId = f.teams.home.id;
  const rows: Array<{ ev: MatchEvent; total: number; extra: number; idx: number }> = [];
  dedupeEvents(f.events ?? []).forEach((e, idx) => {
    const elapsed = e.time.elapsed ?? 0;
    const shootout =
      e.type === 'Goal' && /penalty/i.test(e.detail) && elapsed >= shootoutFrom && (e.time.extra ?? 0) > 0 && status === 'PEN';
    const label = eventLabel(e, shootout);
    if (!label) return;
    const isSub = e.type === 'subst';
    // subst: player = çıkan, assist = giren (AF) → uygulama: player = giren, related_player = çıkan.
    const main = isSub ? e.assist : e.player;
    const other = isSub ? e.player : e.assist;
    const time = shootout ? elapsed : elapsed + (e.time.extra ?? 0);
    const ev: MatchEvent = {
      id: idx + 1,
      player: { id: main.id != null ? toAppId(main.id) : 0, name: normalizeDisplayName(main.name ?? '') ?? '' },
      time,
      event: label,
      sort: 0,
      info: null,
      addition: label === 'VAR' ? e.detail : null,
      is_home: e.team.id === homeId,
      is_away: e.team.id !== homeId,
      ...(other.id != null && other.name && label !== 'VAR' && label !== 'YELLOW_CARD' && label !== 'RED_CARD'
        ? { related_player: { id: toAppId(other.id), name: normalizeDisplayName(other.name) ?? '' } }
        : {}),
    };
    rows.push({ ev, total: time, extra: shootout ? (e.time.extra ?? 0) : 0, idx });
  });
  rows.sort((a, b) => a.total - b.total || a.extra - b.extra || a.idx - b.idx);
  return rows.map((r, i) => ({ ...r.ev, sort: i + 1 }));
}

// ── İstatistik ──────────────────────────────────────────────────────────────

const STAT_FIELDS: Array<[keyof MatchStatsData, string]> = [
  ['possesion', 'Ball Possession'],
  ['corners', 'Corner Kicks'],
  ['shots_on_target', 'Shots on Goal'],
  ['shots_off_target', 'Shots off Goal'],
  ['attempts_on_goal', 'Total Shots'],
  ['shots_blocked', 'Blocked Shots'],
  ['saves', 'Goalkeeper Saves'],
  ['fauls', 'Fouls'],
  ['offsides', 'Offsides'],
  ['yellow_cards', 'Yellow Cards'],
  ['red_cards', 'Red Cards'],
];

function statNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

export function mapNationalStats(f: AfFixture): MatchStatsData | null {
  const rows: AfStatistics[] = f.statistics ?? [];
  const home = rows.find((r) => r.team.id === f.teams.home.id);
  const away = rows.find((r) => r.team.id === f.teams.away.id);
  if (!home && !away) return null;
  const val = (r: AfStatistics | undefined, type: string) => statNumber(r?.statistics.find((s) => s.type === type)?.value);
  const out: MatchStatsData = {};
  let any = false;
  for (const [field, type] of STAT_FIELDS) {
    const h = val(home, type);
    const a = val(away, type);
    if (h == null && a == null) continue;
    out[field] = `${h ?? 0}:${a ?? 0}`;
    any = true;
  }
  return any ? out : null;
}

// ── Kadro ───────────────────────────────────────────────────────────────────

const POSITION: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

function ratingMap(blocks: AfPlayersBlock[] | null | undefined, teamId: number): Map<number, { rating?: number; captain: boolean }> {
  const m = new Map<number, { rating?: number; captain: boolean }>();
  for (const p of blocks?.find((b) => b.team.id === teamId)?.players ?? []) {
    if (p.player.id == null) continue;
    const g = p.statistics?.[0]?.games;
    const r = g?.rating != null ? Number.parseFloat(String(g.rating)) : NaN;
    m.set(p.player.id, { ...(Number.isFinite(r) && r > 0 ? { rating: r } : {}), captain: g?.captain === true });
  }
  return m;
}

function mapLineupPlayer(
  row: AfLineupPlayer,
  teamId: number,
  starter: boolean,
  rowSizes: Map<number, number>,
  extra: Map<number, { rating?: number; captain: boolean }>,
): LineupPlayer {
  const p = row.player;
  const grid = starter && p.grid ? /^(\d+):(\d+)$/.exec(p.grid) : null;
  const r = grid ? Number(grid[1]) : null;
  const c = grid ? Number(grid[2]) : null;
  const size = r != null ? (rowSizes.get(r) ?? 0) : 0;
  const info = p.id != null ? extra.get(p.id) : undefined;
  const pos = p.pos ? POSITION[p.pos] : undefined;
  return {
    team_id: String(toAppId(teamId)),
    id: String(p.id != null ? toAppId(p.id) : 0),
    name: normalizeDisplayName(p.name ?? '') ?? '',
    substitution: starter ? '0' : '1',
    shirt_number: p.number != null ? String(p.number) : '',
    ...(pos ? { position: pos, ...(pos === 'GK' ? { pos_code: 'GK' } : {}) } : {}),
    ...(info?.rating !== undefined ? { rating: info.rating } : {}),
    // Sütun 1 = AF'de sol, uygulamada sağ → satır içinde aynala (bkz. dosya başı).
    ...(r != null && c != null && size > 0 ? { formation_row: r, formation_col: size + 1 - c } : {}),
    ...(info?.captain ? { captain: true as const } : {}),
  };
}

function buildTeam(f: AfFixture, teamId: number, name: string): LineupTeam {
  const l = f.lineups?.find((x) => x.team.id === teamId);
  const extra = ratingMap(f.players, teamId);
  const rowSizes = new Map<number, number>();
  for (const s of l?.startXI ?? []) {
    const m = s.player.grid ? /^(\d+):/.exec(s.player.grid) : null;
    if (m) rowSizes.set(Number(m[1]), (rowSizes.get(Number(m[1])) ?? 0) + 1);
  }
  return {
    team: { id: String(toAppId(teamId)), name: normalizeTeamName(name) },
    players: [
      ...(l?.startXI ?? []).map((s) => mapLineupPlayer(s, teamId, true, rowSizes, extra)),
      ...(l?.substitutes ?? []).map((s) => mapLineupPlayer(s, teamId, false, rowSizes, extra)),
    ],
  };
}

export function mapNationalLineups(f: AfFixture): MatchLineupData | null {
  const any = (f.lineups ?? []).some((l) => (l.startXI?.length ?? 0) + (l.substitutes?.length ?? 0) > 0);
  if (!any) return null;
  return {
    lineup: {
      home: buildTeam(f, f.teams.home.id, f.teams.home.name),
      away: buildTeam(f, f.teams.away.id, f.teams.away.name),
    },
    confirmed: (f.lineups ?? []).some((l) => (l.startXI?.length ?? 0) > 0),
  };
}

export function mapNationalFixture(f: AfFixture): NationalMatchBundle {
  return { match: mapNationalMatch(f), events: mapNationalEvents(f), stats: mapNationalStats(f), lineups: mapNationalLineups(f) };
}
