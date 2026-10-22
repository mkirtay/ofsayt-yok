/**
 * Anlatım sahnesi için kadro ve taraf çözümü — saf modül (sunucu ucu kullanır). Anlatım satırında takım YOK; taraf oyuncu
 * adının kadroda (aynı `fixtures/{id}` isteğinin `lineups` include'u) bulunmasıyla, gollerde skor değişiminden, takımsız
 * "Corner awarded." satırında komşu vuruş satırından çıkarılır. Koordinat verisi yok (ballCoordinates planda açık ama 10 sn
 * örnekli ve olaylarla uyuşmuyor — 2026-10-21, 19746587); sahne temsili.
 */
import { normalizeSearchText } from '@/utils/searchText';
import type { CommentaryItem, SceneSide } from './matchCommentary';

export type ScenePlayer = {
  name: string;
  number: number | null;
  /** Sportmonks `formation_field` satır:sütun (1 = kaleci); yedekte / veri yoksa null. */
  row: number | null;
  col: number | null;
  /** Kaba mevki (position_id 24–27); bilinmiyorsa null. */
  pos: 'G' | 'D' | 'M' | 'F' | null;
  starter: boolean;
};

export type SceneSquad = { name: string; formation: string | null; players: ScenePlayer[] };
export type SceneSquads = { home: SceneSquad; away: SceneSquad };

export type RawLineupRow = {
  player_name?: string | null;
  team_id?: number | null;
  type_id?: number | null;
  position_id?: number | null;
  formation_field?: string | null;
  jersey_number?: number | null;
};
export type RawParticipant = { id?: number | null; name?: string | null; meta?: { location?: string | null } | null };
export type RawFormation = { participant_id?: number | null; formation?: string | null; location?: string | null };

/** `lineups` + `participants` + `formations` alan seçimli include'u (aynı istek; ek Sportmonks çağrısı yok). */
export const SCENE_INCLUDE =
  'lineups:player_name,team_id,type_id,position_id,formation_field,jersey_number;participants:name;formations:participant_id,formation,location';

const STARTER_TYPE_ID = 11;
const POS: Record<number, ScenePlayer['pos']> = { 24: 'G', 25: 'D', 26: 'M', 27: 'F' };

function parseField(field: string | null | undefined): { row: number; col: number } | null {
  const m = /^(\d+):(\d+)$/.exec(field ?? '');
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

/** Ham include'lar → iki kadro. Ev/deplasman `participants.meta.location`'dan; biri eksikse null (sahne varsayılan dizilişle). */
export function buildSceneSquads(
  lineups: readonly RawLineupRow[] | null | undefined,
  participants: readonly RawParticipant[] | null | undefined,
  formations?: readonly RawFormation[] | null,
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
          name: r.player_name!.trim(),
          number: typeof r.jersey_number === 'number' ? r.jersey_number : null,
          row: grid?.row ?? null,
          col: grid?.col ?? null,
          pos: POS[r.position_id ?? -1] ?? null,
          starter,
        };
      }),
  });
  return { home: squad(home, 'home'), away: squad(away, 'away') };
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
        const byScore = sc[0] > prevScore[0] ? 'home' : sc[1] > prevScore[1] ? 'away' : null;
        if (byScore) side = byScore;
        prevScore = sc;
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
