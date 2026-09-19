/**
 * Faz 3 (Katman-2/3) — Sportmonks ham şekillerini mevcut `MatchEvent`/
 * `MatchStatsData`/`MatchLineupData`/`TopScorerEntry` modellerine çevirir.
 *
 * `sportmonksFixtureMapper.ts` maç ÖZETİNİ (`Match`) çeviriyordu; bu dosya maç
 * DETAYINI (olaylar/istatistik/kadro) çeviriyor — aynı fixture'ın farklı
 * include'larından gelen, birbirinden bağımsız üç veri seti.
 */
import type { LineupPlayer, LineupTeam, MatchEvent, MatchLineupData, MatchStatsData } from '@/models/domain';
import type { TopScorerEntry } from './liveScoreService';
import type {
  SportmonksEventRow,
  SportmonksFixture,
  SportmonksLineupRow,
  SportmonksParticipant,
  SportmonksPlayerStatisticDetail,
  SportmonksSquadStatsRow,
  SportmonksStatisticRow,
  SportmonksTopscorerRow,
} from './sportmonks/types';
import { resolveEventLabel } from './sportmonks/typeDictionaries';
import { detailedPositionCode } from '@/utils/positionLabel';
import { resolveParticipantLocation } from './sportmonks/participantLocation';
import { resolvePositionShortCode } from './sportmonks/typeDictionaries';

// ── getMatchWithEvents ──────────────────────────────────────────────────────

export function mapSportmonksEventToMatchEvent(
  event: SportmonksEventRow,
  participants: SportmonksParticipant[] | undefined | null,
): MatchEvent {
  const location = resolveParticipantLocation(event.participant_id, participants);
  return {
    id: event.id,
    player: { id: event.player_id ?? 0, name: event.player_name ?? '' },
    time: event.minute,
    event: resolveEventLabel(event.type_id),
    sort: event.sort_order ?? event.minute,
    info: event.info ?? null,
    is_home: location === 'home',
    is_away: location === 'away',
  };
}

export function mapSportmonksEvents(fixture: SportmonksFixture): MatchEvent[] {
  return (fixture.events ?? []).map((e) => mapSportmonksEventToMatchEvent(e, fixture.participants));
}

// ── getMatchStats ────────────────────────────────────────────────────────────

/**
 * `MatchStatsData` alanı → Sportmonks `type_id` eşlemesi.
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 5 "Mevcut MatchStatsData
 * alanlarıyla doğrudan eşleşenler" listesi + Faz 3'te çözülen `red_cards`→83.
 *
 * `attempts_on_goal` için doc iki aday veriyordu (42 "Shots Total" / 54 "Goal
 * Attempts") — Faz 4'te (docs/SPORTMONKS_MIGRATION_PLAN.md "Faz 4 — Doğrulama")
 * KESİNLEŞTİRİLDİ: iki BAĞIMSIZ gerçek maçta (fixture 19746621 Fenerbahçe-
 * Beşiktaş VE fixture 19732740 Celta de Vigo-Osasuna), her iki takım satırında,
 * `type_id:42` ("Shots Total") tam olarak `41 (Shots Off Target) + 58 (Shots
 * Blocked) + 86 (Shots On Target)` toplamına VE ayrıca `49 (Shots Insidebox) +
 * 50 (Shots Outsidebox)` toplamına eşit çıktı (4/4 takım-satırında sıfır sapma)
 * — bu, `42`'nin gerçekten "toplam şut denemesi" olduğunu matematiksel olarak
 * doğruluyor. `54` ("Goal Attempts") bu toplamla HİÇBİR satırda örtüşmedi
 * (farklı/bağımsız bir istatistik, muhtemelen ayrı bir veri sağlayıcı
 * yönteminden) — `attempts_on_goal` için KULLANILMIYOR, kasıtlı olarak
 * eşlemesiz bırakıldı (bkz. `STAT_FIELD_TYPE_IDS`'te `54`'ün yokluğu).
 */
const STAT_FIELD_TYPE_IDS: Partial<Record<keyof MatchStatsData, number>> = {
  corners: 34,
  shots_off_target: 41,
  attempts_on_goal: 42,
  attacks: 43,
  dangerous_attacks: 44,
  possesion: 45,
  penalties: 47,
  offsides: 51,
  goal_kicks: 53,
  free_kicks: 55,
  fauls: 56,
  saves: 57,
  shots_blocked: 58,
  substitutions: 59,
  throw_ins: 60,
  yellow_cards: 84,
  red_cards: 83, // Faz 3'te doğrulandı (fixture 19732740) — Pass 5'in "hâlâ açık" bıraktığı alan
  shots_on_target: 86,
  treatments: 87,
};

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

/** `"H:A"` — `MatchStats` component'i (`val.split(':')`) bu formatı bekliyor. */
function formatHomeAwayPair(rows: SportmonksStatisticRow[], typeId: number): string | null {
  const forType = rows.filter((r) => r.type_id === typeId);
  if (forType.length === 0) return null;
  const home = forType.find((r) => r.location === 'home');
  const away = forType.find((r) => r.location === 'away');
  const homeVal = home ? toNumber(home.data.value) : 0;
  const awayVal = away ? toNumber(away.data.value) : 0;
  return `${homeVal}:${awayVal}`;
}

export function mapSportmonksStatistics(statistics: SportmonksStatisticRow[] | undefined | null): MatchStatsData | null {
  if (!statistics || statistics.length === 0) return null;

  const out: MatchStatsData = {};
  let any = false;
  for (const [field, typeId] of Object.entries(STAT_FIELD_TYPE_IDS) as Array<[keyof MatchStatsData, number]>) {
    const pair = formatHomeAwayPair(statistics, typeId);
    if (pair !== null) {
      out[field] = pair;
      any = true;
    }
  }
  return any ? out : null;
}

// ── getMatchLineups ──────────────────────────────────────────────────────────

const BENCH_LINEUP_TYPE_ID = 12;
/** `lineups.details[]` içinde "Rating" (RATING) — Süper Lig dahil doğrulandı (Kasımpaşa-Konyaspor 19746608). */
export const LINEUP_RATING_TYPE_ID = 118;

/** `details[]`'ten yalnızca reytingi çeker (~50 alanın geri kalanı bilinçli atılıyor). Sayı değilse / ≤0 ise `undefined`. */
export function extractLineupRating(details: SportmonksLineupRow['details']): number | undefined {
  const raw = details?.find((d) => d.type_id === LINEUP_RATING_TYPE_ID)?.data?.value;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `"2:3"` → `{row:2, col:3}`; boş/bozuk değer için `null` (yedekler ve bazı liglerde `null` geliyor). */
export function parseFormationField(field: string | null | undefined): { row: number; col: number } | null {
  const m = /^(\d+):(\d+)$/.exec(field ?? '');
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

function mapLineupRowToPlayer(row: SportmonksLineupRow): LineupPlayer {
  const rating = extractLineupRating(row.details);
  const posCode = detailedPositionCode(row.player?.detailed_position_id, resolvePositionShortCode(row.position_id));
  const grid = row.type_id === BENCH_LINEUP_TYPE_ID ? null : parseFormationField(row.formation_field);
  return {
    team_id: String(row.team_id),
    id: String(row.player_id),
    name: row.player?.display_name ?? row.player?.name ?? row.player_name,
    substitution: row.type_id === BENCH_LINEUP_TYPE_ID ? '1' : '0',
    shirt_number: row.jersey_number != null ? String(row.jersey_number) : '',
    ...(resolvePositionShortCode(row.position_id) ? { position: resolvePositionShortCode(row.position_id)! } : {}),
    ...(row.player?.image_path ? { photo: row.player.image_path } : {}),
    ...(posCode ? { pos_code: posCode } : {}),
    ...(row.player?.nationality?.image_path
      ? { nationality: { ...(row.player.nationality.name ? { name: row.player.nationality.name } : {}), flag: row.player.nationality.image_path } }
      : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(grid ? { formation_row: grid.row, formation_col: grid.col } : {}),
  };
}

/**
 * Takım adı `fixture.participants[]`'tan geliyor, `lineups[].team_id` eşleşmesiyle
 * — `include=lineups.team` DEĞİL. Faz 4'te (docs/SPORTMONKS_MIGRATION_PLAN.md
 * "Faz 4 — Doğrulama") bu ayrıca gerçek bir istekle test edildi:
 * `GET /fixtures/{id}?include=lineups.team` **400/422 hata veriyor** —
 * `{"message":"The requested include 'team' does not exist on Lineup","code":5013}`.
 * Yani `lineups.team` Sportmonks şemasında GEÇERLİ bir include bile değil (Pass
 * 4'ün "muhtemelen include=lineups.team" varsayımı yanlıştı) — `participants[]`
 * üzerinden çözmek bir workaround değil, TEK doğru yol.
 */
function buildLineupTeam(
  participant: SportmonksParticipant | undefined,
  rows: SportmonksLineupRow[],
): LineupTeam {
  const players = participant ? rows.filter((r) => r.team_id === participant.id).map(mapLineupRowToPlayer) : [];
  return {
    team: { id: String(participant?.id ?? ''), name: participant?.name ?? '' },
    players,
  };
}

/**
 * `include=lineups.player` — Faz 4'te gerçek istekle KESİNLEŞTİRİLDİ: nested
 * `player` objesi gerçekten `image_path` (foto) VE `display_name` içeriyor,
 * ayrı bir istek gerekmiyor (Pass 4'ün açık bıraktığı soru). `mapLineupRowToPlayer`
 * bunu doğrudan `row.player?.image_path`/`row.player?.display_name`'den okuyor.
 */
export function mapSportmonksLineups(fixture: SportmonksFixture): MatchLineupData | null {
  const rows = fixture.lineups;
  if (!rows || rows.length === 0) return null;

  const home = fixture.participants?.find((p) => p.meta?.location === 'home');
  const away = fixture.participants?.find((p) => p.meta?.location === 'away');

  return {
    lineup: {
      home: buildLineupTeam(home, rows),
      away: buildLineupTeam(away, rows),
    },
  };
}

// ── getTopScorers ─────────────────────────────────────────────────────────────

export function mapTopscorerRowToEntry(row: SportmonksTopscorerRow): TopScorerEntry {
  return {
    goals: row.total,
    ...(row.participant
      ? { team: { id: row.participant.id, name: row.participant.name, logo: row.participant.image_path ?? undefined } }
      : {}),
    ...(row.player
      ? {
          player: {
            id: row.player.id,
            name: row.player.display_name ?? row.player.name ?? '',
            photo: row.player.image_path ?? undefined,
          },
        }
      : {}),
  };
}

/** `seasonTopscorerTypes` — 208 gol, 209 asist (2026-09-19, `/topscorers/seasons/28203` gerçek yanıtında doğrulandı: "Assist Topscorer"). */
export const GOAL_TOPSCORER_TYPE_ID = 208;
export const ASSIST_TOPSCORER_TYPE_ID = 209;
/** Oyuncu sezon istatistiği `details[]` içinde APPEARANCES (oynanan maç). */
export const APPEARANCES_STAT_TYPE_ID = 321;

/**
 * Gol satırlarından (208) liste çıkarır, asistleri (209) `player_id` ile ekler. Liste GOL sıralamasıdır: yalnızca
 * asisti olup golü olmayan oyuncu (gerçek veride 49 kişi) listeye girmez. Asist sıralamasında olmayan
 * oyuncunun `assists`'i `undefined` kalır (UI "—" gösterir, "0" değil).
 */
export function mapTopscorerRowsToEntries(rows: SportmonksTopscorerRow[]): TopScorerEntry[] {
  const assists = new Map<number, number>();
  for (const r of rows) {
    if (r.type_id === ASSIST_TOPSCORER_TYPE_ID && Number.isFinite(r.total) && r.total > 0) assists.set(r.player_id, r.total);
  }
  return rows
    .filter((r) => r.type_id === GOAL_TOPSCORER_TYPE_ID)
    .map((r) => {
      const entry = mapTopscorerRowToEntry(r);
      const a = assists.get(r.player_id);
      return a !== undefined ? { ...entry, assists: a } : entry;
    });
}

/** Takım kadrosu istatistiklerinden `player_id → oynanan maç` (yalnızca >0; yoksa anahtar hiç yok). */
export function extractAppearances(rows: SportmonksSquadStatsRow[], seasonId: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const row of rows) {
    const stat = row.player?.statistics?.find((s) => s.season_id === seasonId);
    const raw = stat?.details?.find((d) => d.type_id === APPEARANCES_STAT_TYPE_ID)?.value;
    const n = typeof raw === 'number' ? raw : typeof raw === 'object' && raw ? raw.total : undefined;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[row.player_id] = n;
  }
  return out;
}

/** Kadro mini tablosu satırı: M/G/A/SK/KK + ayrıntılı pozisyon id'si. Sayılar yalnızca M>0 iken anlamlıdır. */
export type SquadStatLine = {
  appearances?: number;
  goals?: number;
  assists?: number;
  yellow?: number;
  red?: number;
  detailedPositionId?: number;
};

const SQUAD_STAT_TYPE_IDS = { GOALS: 52, ASSISTS: 79, RED: 83, YELLOW: 84 } as const;

function detailTotal(details: SportmonksPlayerStatisticDetail[] | undefined, typeId: number): number | undefined {
  const raw = details?.find((d) => d.type_id === typeId)?.value;
  const n = typeof raw === 'number' ? raw : typeof raw === 'object' && raw ? (raw.total ?? (raw as { goals?: number }).goals) : undefined;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * `squads/seasons/{sid}/teams/{tid}?include=player.statistics.details` → `player_id → M/G/A/SK/KK`.
 * Gerçek veride (Galatasaray 2026/27, 18 Süper Lig takımı taranarak doğrulandı) sıfır olan istatistik `details`'te
 * HİÇ GELMEZ (ör. kırmızı kart 83 yalnızca >0 iken var). Bu yüzden oynadığı doğrulanmış (M>0) oyuncuda eksik
 * G/A/SK/KK gerçekten 0'dır; M bilinmiyorsa hiçbiri yazılmaz (UI "—").
 * `team_id` verildiyse aynı sezonda başka takımdaki (transfer) satır alınmaz.
 */
export function extractSquadStats(rows: SportmonksSquadStatsRow[], seasonId: number, teamId?: number): Record<number, SquadStatLine> {
  const out: Record<number, SquadStatLine> = {};
  for (const row of rows) {
    const stats = row.player?.statistics?.filter((s) => s.season_id === seasonId && (teamId == null || s.team_id == null || s.team_id === teamId));
    const details = stats?.flatMap((s) => s.details ?? []);
    const line: SquadStatLine = {};
    const dp = row.player?.detailed_position_id;
    if (typeof dp === 'number') line.detailedPositionId = dp;
    const m = detailTotal(details, APPEARANCES_STAT_TYPE_ID);
    if (m != null && m > 0) {
      line.appearances = m;
      line.goals = detailTotal(details, SQUAD_STAT_TYPE_IDS.GOALS) ?? 0;
      line.assists = detailTotal(details, SQUAD_STAT_TYPE_IDS.ASSISTS) ?? 0;
      line.yellow = detailTotal(details, SQUAD_STAT_TYPE_IDS.YELLOW) ?? 0;
      line.red = detailTotal(details, SQUAD_STAT_TYPE_IDS.RED) ?? 0;
    }
    if (Object.keys(line).length > 0) out[row.player_id] = line;
  }
  return out;
}

export type TeamTopScorer = { playerId: number; name: string; photo?: string; goals: number };

/** Kadro istatistiğinden takımın sezondaki en golcüleri (gol>0; eşitlikte daha az maçta atan önce), en çok `limit` kişi. */
export function extractTeamTopScorers(
  rows: SportmonksSquadStatsRow[],
  seasonId: number,
  teamId?: number,
  limit = 3,
): TeamTopScorer[] {
  const stats = extractSquadStats(rows, seasonId, teamId);
  const list: Array<TeamTopScorer & { apps: number }> = [];
  for (const row of rows) {
    const line = stats[row.player_id];
    if (!line?.goals || line.goals <= 0) continue;
    list.push({
      playerId: row.player_id,
      name: (row.player?.display_name ?? row.player?.name ?? '').trim(),
      ...(row.player?.image_path ? { photo: row.player.image_path } : {}),
      goals: line.goals,
      apps: line.appearances ?? Number.POSITIVE_INFINITY,
    });
  }
  return list
    .sort((a, b) => b.goals - a.goals || a.apps - b.apps)
    .slice(0, limit)
    .map(({ apps: _apps, ...p }) => {
      void _apps;
      return p;
    });
}

// ── getTopDisciplinary ────────────────────────────────────────────────────────

export const DISCIPLINARY_TYPE_IDS = { RED: 83, YELLOW: 84 } as const;

export type DisciplinaryRow = {
  player: { id: number; name: string };
  team: { id: number; name: string };
  yellow_cards: number;
  red_cards: number;
};

/**
 * `filters=seasonTopscorerTypes:83,84` iki AYRI satır döner (biri kırmızı, biri
 * sarı sayısı) — mevcut `/standings` sayfası tek satırda `{yellow_cards,
 * red_cards}` bekliyor (bkz. `src/pages/standings/index.tsx`). Aynı oyuncunun
 * iki satırını `player_id` üzerinden birleştirir.
 */
export function mergeDisciplinaryRows(rows: SportmonksTopscorerRow[]): DisciplinaryRow[] {
  const byPlayer = new Map<number, DisciplinaryRow>();
  for (const row of rows) {
    const existing = byPlayer.get(row.player_id) ?? {
      player: { id: row.player_id, name: row.player?.display_name ?? row.player?.name ?? '' },
      team: { id: row.participant_id, name: row.participant?.name ?? '' },
      yellow_cards: 0,
      red_cards: 0,
    };
    if (row.type_id === DISCIPLINARY_TYPE_IDS.YELLOW) existing.yellow_cards = row.total;
    if (row.type_id === DISCIPLINARY_TYPE_IDS.RED) existing.red_cards = row.total;
    byPlayer.set(row.player_id, existing);
  }
  return Array.from(byPlayer.values());
}
