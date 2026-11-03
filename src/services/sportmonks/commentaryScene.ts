/**
 * Anlatım sahnesi için kadro ve taraf çözümü — saf modül (sunucu ucu kullanır). Anlatım satırında takım YOK; taraf oyuncu
 * adının kadroda (aynı `fixtures/{id}` isteğinin `lineups` include'u) bulunmasıyla, gollerde skor değişiminden, takımsız
 * "Corner awarded." satırında komşu vuruş satırından çıkarılır. Koordinat verisi yok (ballCoordinates planda açık ama 10 sn
 * örnekli ve olaylarla uyuşmuyor — 2026-10-21, 19746587; `events` satırlarında koordinat alanı yok — 2026-11-03); sahne temsili.
 *
 * Aynı istekte: `events` (değişiklik 18, kırmızı 20, ikinci sarı 21) → olay anında sahadaki 11 (`squadsAt`); `metadata`
 * 161/162 → maça özel forma rengi (bkz. momentumColors.ts).
 */
import { normalizeSearchText } from '@/utils/searchText';
import type { CommentaryItem, SceneSide } from './matchCommentary';
import { MOMENTUM_COLOR_METADATA_TYPES, pickMomentumColors, type TeamKit } from './momentumColors';

export type ScenePlayer = {
  /** Sportmonks `player_id` (değişiklik / kırmızı kart eşlemesi); yoksa null. */
  id: number | null;
  name: string;
  number: number | null;
  /** Sportmonks `formation_field` satır:sütun (1 = kaleci); yedekte / veri yoksa null. */
  row: number | null;
  col: number | null;
  /** Kaba mevki (position_id 24–27); bilinmiyorsa null. */
  pos: 'G' | 'D' | 'M' | 'F' | null;
  starter: boolean;
};

export type SceneSquad = {
  name: string;
  formation: string | null;
  players: ScenePlayer[];
  /** Maça özel forma rengi (#rrggbb; deplasman ev rengine çok yakınsa formasındaki diğer renk); metadata yoksa null. */
  color?: string | null;
};

/** Kadro değişimi: oyuncu değişikliği (`in` girer, `out` çıkar) ya da kırmızı kart (`out` sahadan çıkar). */
export type SquadChange = { minute: number; extra: number; side: SceneSide; kind: 'sub' | 'red'; out: number; in?: number };

export type SceneSquads = { home: SceneSquad; away: SceneSquad; changes?: SquadChange[] };

export type RawLineupRow = {
  player_id?: number | null;
  player_name?: string | null;
  team_id?: number | null;
  type_id?: number | null;
  position_id?: number | null;
  formation_field?: string | null;
  jersey_number?: number | null;
};
export type RawParticipant = { id?: number | null; name?: string | null; meta?: { location?: string | null } | null };
export type RawFormation = { participant_id?: number | null; formation?: string | null; location?: string | null };
export type RawSceneEvent = {
  type_id?: number | null;
  minute?: number | null;
  extra_minute?: number | null;
  player_id?: number | null;
  related_player_id?: number | null;
  participant_id?: number | null;
  sort_order?: number | null;
};
export type RawMetadata = { type_id?: number | null; values?: unknown };

/**
 * Aynı istekte kadro, diziliş, kadro değişimleri ve forma rengi (ek Sportmonks çağrısı yok). `lineups` alan SEÇİMSİZ:
 * seçimli include'da `jersey_number` her satırda null geliyor (2026-11-03, 19746574; seçimsizde 42/42 dolu). `metadata`
 * da seçimsiz (seçimliyken boş) — filtre `SCENE_FILTERS`.
 */
export const SCENE_INCLUDE =
  'lineups;participants:name;formations:participant_id,formation,location;events:type_id,minute,extra_minute,player_id,related_player_id,participant_id,sort_order;metadata';
export const SCENE_EVENT_TYPES = { SUBSTITUTION: 18, RED: 20, SECOND_YELLOW: 21 } as const;
export const SCENE_FILTERS = `eventTypes:${Object.values(SCENE_EVENT_TYPES).join(',')};metadataTypes:${MOMENTUM_COLOR_METADATA_TYPES.HOME},${MOMENTUM_COLOR_METADATA_TYPES.AWAY}`;

const STARTER_TYPE_ID = 11;
const POS: Record<number, ScenePlayer['pos']> = { 24: 'G', 25: 'D', 26: 'M', 27: 'F' };

function parseField(field: string | null | undefined): { row: number; col: number } | null {
  const m = /^(\d+):(\d+)$/.exec(field ?? '');
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

/**
 * Ham include'lar → iki kadro. Ev/deplasman `participants.meta.location`'dan; biri eksikse null (sahne varsayılan dizilişle).
 * `events` → kadro değişimleri (oyuncu kimliğiyle; kimliği olmayan satır atlanır), `metadata` → forma renkleri.
 */
export function buildSceneSquads(
  lineups: readonly RawLineupRow[] | null | undefined,
  participants: readonly RawParticipant[] | null | undefined,
  formations?: readonly RawFormation[] | null,
  events?: readonly RawSceneEvent[] | null,
  metadata?: readonly RawMetadata[] | null,
): SceneSquads | null {
  const home = participants?.find((p) => p?.meta?.location === 'home');
  const away = participants?.find((p) => p?.meta?.location === 'away');
  if (typeof home?.id !== 'number' || typeof away?.id !== 'number') return null;
  const squad = (team: RawParticipant, location: SceneSide): SceneSquad => ({
    name: team.name ?? '',
    formation: formations?.find((f) => f?.location === location || f?.participant_id === team.id)?.formation ?? null,
    players: (lineups ?? [])
      .filter((r) => r?.team_id === team.id && typeof r.player_name === 'string' && r.player_name.trim())
      .map((r) => {
        const starter = r.type_id === STARTER_TYPE_ID;
        const grid = starter ? parseField(r.formation_field) : null;
        return {
          id: typeof r.player_id === 'number' ? r.player_id : null,
          name: r.player_name!.trim(),
          number: typeof r.jersey_number === 'number' ? r.jersey_number : null,
          row: grid?.row ?? null,
          col: grid?.col ?? null,
          pos: POS[r.position_id ?? -1] ?? null,
          starter,
        };
      }),
  });
  const out: SceneSquads = { home: squad(home, 'home'), away: squad(away, 'away') };
  const kit = (type: number) => {
    const v = metadata?.find((r) => r?.type_id === type)?.values;
    return v && typeof v === 'object' ? (v as TeamKit) : null;
  };
  const colors = pickMomentumColors(kit(MOMENTUM_COLOR_METADATA_TYPES.HOME), kit(MOMENTUM_COLOR_METADATA_TYPES.AWAY));
  if (colors) {
    out.home.color = colors.home.fill;
    out.away.color = colors.away.fill;
  }
  const changes: SquadChange[] = [];
  for (const e of [...(events ?? [])].sort((a, b) => changeKey(a.minute, a.extra_minute) - changeKey(b.minute, b.extra_minute) || (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    if (typeof e?.minute !== 'number' || typeof e.player_id !== 'number') continue;
    const side: SceneSide | null = e.participant_id === home.id ? 'home' : e.participant_id === away.id ? 'away' : null;
    if (!side) continue;
    const at = { minute: e.minute, extra: typeof e.extra_minute === 'number' ? e.extra_minute : 0, side };
    if (e.type_id === SCENE_EVENT_TYPES.SUBSTITUTION && typeof e.related_player_id === 'number') {
      changes.push({ ...at, kind: 'sub', in: e.player_id, out: e.related_player_id });
    } else if (e.type_id === SCENE_EVENT_TYPES.RED || e.type_id === SCENE_EVENT_TYPES.SECOND_YELLOW) {
      changes.push({ ...at, kind: 'red', out: e.player_id });
    }
  }
  if (changes.length) out.changes = changes;
  return out;
}

/** Dakika sıralama anahtarı: 90+4 → 9004 (uzatma dakikası normal dakikadan sonra, sonraki dakikadan önce). */
export const changeKey = (minute: number | null | undefined, extra?: number | null) => (minute ?? 0) * 100 + (extra ?? 0);

/**
 * Olay anında sahadaki kadro: anahtarı olaydan ÖNCE olan değişiklikler uygulanır (`inclusive`: aynı dakikadakiler de).
 * Giren oyuncu çıkanın diziliş yerini (satır:sütun) alır ve ilk 11 sayılır; kırmızı kart gören sahadan çıkar (10 kişi).
 * Kimliği eşleşmeyen değişiklik yok sayılır (kadro uydurulmaz).
 */
export function squadsAt(squads: SceneSquads, minute: number | null, extra: number | null, inclusive = false): SceneSquads {
  const at = changeKey(minute, extra);
  const due = (squads.changes ?? []).filter((c) => (inclusive ? changeKey(c.minute, c.extra) <= at : changeKey(c.minute, c.extra) < at));
  if (minute == null || due.length === 0) return squads;
  const next: SceneSquads = { ...squads, home: { ...squads.home, players: squads.home.players.map((p) => ({ ...p })) }, away: { ...squads.away, players: squads.away.players.map((p) => ({ ...p })) } };
  for (const c of due) {
    const players = next[c.side].players;
    const off = players.find((p) => p.id === c.out && p.starter);
    if (!off) continue;
    off.starter = false;
    if (c.kind === 'sub') {
      const on = players.find((p) => p.id === c.in && !p.starter);
      if (on) Object.assign(on, { starter: true, row: off.row, col: off.col });
    }
    off.row = null;
    off.col = null;
  }
  return next;
}

/** Olayın oynandığı devre: ev sahibi 1. devrede (ve uzatmanın ilk yarısında) sağa, 2. devrede sola hücum eder. */
export function isSecondHalf(minute: number | null): boolean {
  if (minute == null) return false;
  return (minute > 45 && minute <= 90) || minute > 105;
}

const tokens = (name: string) =>
  normalizeSearchText(name)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== 'jr' && t !== 'sr' && t.length > 1);

/**
 * Anlatımdaki ad ("Victor James Osimhen", "Alexey Batrakov") → kadrodaki oyuncu ("Victor Osimhen", "Aleksey Batrakov").
 * Aksansız token karşılaştırması: kadro adının tüm tokenları metinde → en güçlü; yoksa soyad eşleşmesi. Belirsizse null.
 */
export function findPlayer(squads: SceneSquads, name: string): { side: SceneSide; index: number } | null {
  const want = tokens(name);
  if (want.length === 0) return null;
  let best: { side: SceneSide; index: number; score: number } | null = null;
  let tie = false;
  for (const side of ['home', 'away'] as const) {
    const players = squads[side].players;
    for (let index = 0; index < players.length; index++) {
      const have = tokens(players[index]!.name);
      if (have.length === 0) continue;
      const common = have.filter((t) => want.includes(t)).length;
      const last = have.at(-1)!;
      let score = 0;
      if (common === have.length) score = 10 + common;
      else if (want.includes(last)) score = 5 + common;
      else if (common > 0 && want[0] === have[0]) score = 2 + common;
      if (score === 0) continue;
      if (!best || score > best.score) {
        best = { side, index, score };
        tie = false;
      } else if (score === best.score) tie = true;
    }
  }
  return best && !tie ? { side: best.side, index: best.index } : null;
}

const other = (s: SceneSide): SceneSide => (s === 'home' ? 'away' : 'home');

/** Metindeki takım adı ("PEC Zwolle", "Brighton and Hove Albion") → taraf; aksansız, biri diğerini içeriyorsa eşleşir. */
export function sideOfTeam(squads: SceneSquads, team: string): SceneSide | null {
  const want = tokens(team).join(' ');
  if (!want) return null;
  const hits = (['home', 'away'] as const).filter((side) => {
    const have = tokens(squads[side].name).join(' ');
    return !!have && (have === want || have.includes(want) || want.includes(have));
  });
  return hits.length === 1 ? hits[0]! : null;
}

function parseScore(text: string): [number, number] | null {
  const m = /(\d+)\s*-\s*(\d+)(?!.*\d+\s*-\s*\d+)/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Sahnelerin tarafını (`scene.side`) doldurur. Sıra: oyuncu kadroda → takımı (kendi kalesine golde rakip); gol satırında
 * skor değişimi; korner → aynı / önceki dakikadaki vuruş satırının (savunmaya takılan/kurtarılan şut korner getirir) ya
 * da sonraki dakikadaki vuruşun tarafı. Girdi sırası fark etmez (`order` ile kronolojik işlenir); yeni dizi döner.
 */
export function resolveSceneSides(items: readonly CommentaryItem[], squads: SceneSquads | null): CommentaryItem[] {
  const chrono = [...items].sort((a, b) => a.order - b.order || a.id - b.id);
  const sideById = new Map<number, SceneSide | null>();
  let prevScore: [number, number] = [0, 0];

  for (const item of chrono) {
    const scene = item.scene;
    if (!scene) continue;
    let side: SceneSide | null = null;
    const hit = squads && scene.actors[0] ? findPlayer(squads, scene.actors[0]) : null;
    if (hit) side = scene.ownGoal ? other(hit.side) : hit.side;
    if (scene.type === 'goal') {
      const sc = parseScore(item.en);
      if (sc) {
        // Skor kimi zaman gol atan takıma göre yazılır ("Arsenal leads 1-0 against Liverpool", 2026-11-01 19722117):
        // oyuncu kadroda bulunduysa taraf ondan; skor o tarafla çelişiyorsa ters çevrilip öyle kaydedilir.
        const by = (x: [number, number]): SceneSide | null => (x[0] > prevScore[0] ? 'home' : x[1] > prevScore[1] ? 'away' : null);
        let score = sc;
        if (side && by(sc) !== side && by([sc[1], sc[0]]) === side) score = [sc[1], sc[0]];
        side ??= by(score);
        prevScore = score;
      }
    }
    // Değişiklik: giren kadroda bulunamazsa çıkan oyuncunun takımı.
    if (!side && scene.type === 'substitution' && squads && scene.actors[1]) side = findPlayer(squads, scene.actors[1])?.side ?? null;
    if (!side && squads && scene.team && !scene.ownGoal) side = sideOfTeam(squads, scene.team);
    sideById.set(item.id, side);
  }

  // Korner: komşu vuruş satırları (aynı dakika önce, sonra; bir dakika önce/sonra).
  const isAttack = (i: CommentaryItem) => !!i.scene && /^shot_|^goal$/.test(i.scene.type) && sideById.get(i.id);
  chrono.forEach((item, idx) => {
    if (item.scene?.type !== 'corner' || sideById.get(item.id)) return;
    const near = (from: number, step: number) => {
      for (let j = from; j >= 0 && j < chrono.length; j += step) {
        const c = chrono[j]!;
        if (item.minute != null && c.minute != null && Math.abs(c.minute - item.minute) > 1) return null;
        if (c.scene?.type === 'corner') continue;
        if (isAttack(c)) return c;
      }
      return null;
    };
    const prev = near(idx - 1, -1);
    const next = near(idx + 1, 1);
    const pick =
      prev && (prev.minute === item.minute || !next) ? prev : next && (next.minute === item.minute || !prev) ? next : (prev ?? next);
    sideById.set(item.id, pick ? sideById.get(pick.id)! : null);
  });

  return items.map((i) => (i.scene ? { ...i, scene: { ...i.scene, side: sideById.get(i.id) ?? null } } : i));
}
