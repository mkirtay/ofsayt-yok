/**
 * Temsili anlatım sahnesinin geometrisi — saf modül (bileşen yalnız çizer, test buradan). Koordinat verisi YOK
 * (ballCoordinates planda açık ama 10 sn örnekli ve olaylarla uyuşmuyor, 2026-10-21/19746587): oyuncular kadro
 * dizilişinden, top metinden çıkarılan bölgeden. Sahne 504×320 çizilir, kutuya ScaledScene ölçekler.
 */
import type { CommentaryItem, SceneSide, SceneZone } from '@/services/sportmonks/matchCommentary';
import { findPlayer, type SceneSquads } from '@/services/sportmonks/commentaryScene';

export const SCENE_W = 504;
export const SCENE_H = 320;

/** Kale ağzının dikey yarıçapı (yatay orta çizgi 160). */
const GOAL_HALF = 30;
const MID_Y = SCENE_H / 2;

export type SceneDot = {
  side: SceneSide;
  name: string;
  number: number | null;
  x: number;
  y: number;
  goalkeeper: boolean;
  /** Olayın aktörü (vuran, kart gören, faul yapan) — vurgulu çizilir. */
  actor: boolean;
  /** Oyuna giren (değişiklikte) — kenardan içeri kayar. */
  comingOn?: boolean;
  /** Çıkan oyuncu — kenara kayar. */
  goingOff?: boolean;
};

export type SceneBall = {
  /** Başlangıç ve bitiş noktası (px, sahne koordinatı). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Topun yol boyunca yükselip alçalması (korner/ortada belirgin). */
  arc: number;
  /** Vuruşun engele takılıp geri dönmesi (bloke / direk / kurtarış). */
  rebound: boolean;
};

export type SceneLayout = {
  dots: SceneDot[];
  ball: SceneBall | null;
  /** Kale ağzı parlaması — gol. */
  goalFlash: { x: number; y: number } | null;
  /** Kaleci kurtarışı: topun durduğu nokta. */
  save: { x: number; y: number } | null;
  /** Kart: aktörün yanında hakem + kart. */
  card: { x: number; y: number; red: boolean } | null;
  /** Saniye cinsinden sahne süresi (3–5 sn). */
  durationMs: number;
  /** Hücum eden taraf; bilinmiyorsa 'home' varsayılır (sahne yine temsili). */
  side: SceneSide;
};

/** Varsayılan 4-4-2: kadro ya da `formation_field` yoksa. Satır = kaleden ileriye, her satır eşit aralıklı. */
const DEFAULT_ROWS = [1, 4, 4, 2];

/** Oyuncu noktalarının kendi yarı sahasındaki yatay aralığı (kaleciden en ileri oyuncuya). */
const X_NEAR = 18;
const X_FAR = 232;
/** Dikey aralık: kenar çizgilerinden içeride kalsın. */
const Y_NEAR = 34;
const Y_FAR = SCENE_H - 34;
/** Yedek kulübesi hizası: oyuna giren / çıkan oyuncunun kenardaki yeri. */
export const BENCH_Y = Y_NEAR - 22;

const mirror = (x: number) => SCENE_W - x;

/** Satır içindeki i. oyuncunun (n kişilik satır) dikey yeri; tek kişi ortada. */
function rowY(index: number, count: number): number {
  return Y_NEAR + ((index + 1) / (count + 1)) * (Y_FAR - Y_NEAR);
}

function rowX(row: number, maxRow: number): number {
  if (maxRow <= 1) return X_NEAR;
  return X_NEAR + ((row - 1) / (maxRow - 1)) * (X_FAR - X_NEAR);
}

type Placed = { name: string; number: number | null; goalkeeper: boolean; x: number; y: number };

/**
 * Bir takımın ilk 11'i → nokta yerleşimi. Sportmonks `formation_field` "satır:sütun" (satır 1 = kaleci) varsa ondan,
 * yoksa mevkiden (G/D/M/F), o da yoksa 4-4-2. `home` sola yerleşir (sağa hücum eder), `away` aynalanır.
 */
export function placeSquad(squads: SceneSquads | null, side: SceneSide): Placed[] {
  const players = (squads?.[side].players ?? []).filter((p) => p.starter).slice(0, 11);
  const withGrid = players.filter((p) => p.row != null && p.col != null);
  const rows = new Map<number, Placed[]>();

  const push = (row: number, p: Placed) => {
    const list = rows.get(row) ?? [];
    list.push(p);
    rows.set(row, list);
  };

  if (withGrid.length >= 7) {
    for (const p of [...withGrid].sort((a, b) => a.row! - b.row! || a.col! - b.col!)) {
      push(p.row!, { name: p.name, number: p.number, goalkeeper: p.row === 1, x: 0, y: 0 });
    }
  } else {
    // Mevki bilgisi varsa ondan satır kur (G=1, D=2, M=3, F=4); hiç yoksa adsız 4-4-2.
    const byPos = players.filter((p) => p.pos);
    const order: Record<string, number> = { G: 1, D: 2, M: 3, F: 4 };
    if (byPos.length >= 7) {
      for (const p of byPos) push(order[p.pos!]!, { name: p.name, number: p.number, goalkeeper: p.pos === 'G', x: 0, y: 0 });
    } else {
      let i = 0;
      DEFAULT_ROWS.forEach((count, row) => {
        for (let n = 0; n < count; n++, i++) {
          const p = players[i];
          push(row + 1, { name: p?.name ?? '', number: p?.number ?? null, goalkeeper: row === 0, x: 0, y: 0 });
        }
      });
    }
  }

  const maxRow = Math.max(...rows.keys());
  const out: Placed[] = [];
  for (const [row, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const x = rowX(row, maxRow);
    list.forEach((p, index) => {
      out.push({ ...p, x: side === 'home' ? x : mirror(x), y: side === 'home' ? rowY(index, list.length) : rowY(list.length - 1 - index, list.length) });
    });
  }
  return out;
}

/** Hücum eden tarafın saldırdığı kale ağzının ortası. Top yarıçapı kadar içeride: son karede top kenardan taşmaz. */
export function goalMouth(side: SceneSide): { x: number; y: number } {
  return { x: side === 'home' ? SCENE_W - 12 : 12, y: MID_Y };
}

/** Bölge → topun çıkış noktası. Sol/sağ HÜCUM EDEN oyuncunun bakışına göre (ekranda ev sahibi sağa hücum eder). */
export function zonePoint(zone: SceneZone | null, side: SceneSide): { x: number; y: number } {
  const depth: Record<SceneZone, number> = {
    six_yard: 36,
    box_centre: 74,
    box_left: 74,
    box_right: 74,
    outside_box_centre: 126,
    outside_box_left: 126,
    outside_box_right: 126,
  };
  const lateral: Partial<Record<SceneZone, number>> = { box_left: -58, box_right: 58, outside_box_left: -74, outside_box_right: 74 };
  const z = zone ?? 'box_centre';
  const d = depth[z];
  // Ekran koordinatında y aşağı artar: sağa hücum edenin solu yukarıda, sola hücum edenin solu aşağıda.
  const flip = side === 'home' ? 1 : -1;
  return { x: side === 'home' ? SCENE_W - d : d, y: MID_Y + (lateral[z] ?? 0) * flip };
}

/** Kornerin atıldığı köşe: bölge sol/sağ ise o köşe, değilse olay kimliğinden belirlenimli. */
export function cornerPoint(zone: SceneZone | null, side: SceneSide, id: number): { x: number; y: number } {
  const leftish = zone === 'box_left' || zone === 'outside_box_left';
  const rightish = zone === 'box_right' || zone === 'outside_box_right';
  const left = leftish || (!rightish && Math.abs(id) % 2 === 0);
  const flip = side === 'home' ? 1 : -1;
  return { x: side === 'home' ? SCENE_W - 4 : 4, y: MID_Y + (left ? -1 : 1) * flip * (MID_Y - 6) };
}

/**
 * Satır → sahne yerleşimi. Sahnesi olmayan satır için null. Aktör(ler) kadroda bulunursa vurgulanır; bulunamazsa
 * sahne yine çizilir (noktalar dizilişte kalır) — "temsili canlandırma" notu bunun için sabit duruyor.
 */
export function buildScene(item: CommentaryItem, squads: SceneSquads | null): SceneLayout | null {
  const scene = item.scene;
  if (!scene) return null;
  const side: SceneSide = scene.side ?? 'home';

  const dots: SceneDot[] = [];
  for (const s of ['home', 'away'] as const) {
    for (const p of placeSquad(squads, s)) {
      dots.push({ side: s, name: p.name, number: p.number, x: p.x, y: p.y, goalkeeper: p.goalkeeper, actor: false });
    }
  }
  /**
   * Anlatımdaki adı sahadaki noktayla eşler (ad üzerinden; yerleşim sırası kadro sırasından farklı). Oyuncu yedekse
   * sahada noktası yoktur: oyuna giriyorsa orta sahanın kenarında yeni bir nokta açılır, değilse null.
   */
  const markActor = (name: string | undefined, extra: Partial<SceneDot> = {}): SceneDot | null => {
    if (!name || !squads) return null;
    const hit = findPlayer(squads, name);
    if (!hit) return null;
    const player = squads[hit.side].players[hit.index];
    if (!player) return null;
    const dot = dots.find((d) => d.side === hit.side && d.name === player.name);
    if (dot) {
      Object.assign(dot, { actor: true, ...extra });
      return dot;
    }
    if (!extra.comingOn) return null;
    const bench: SceneDot = {
      side: hit.side,
      name: player.name,
      number: player.number,
      x: SCENE_W / 2 + (hit.side === 'home' ? -30 : 30),
      y: BENCH_Y,
      goalkeeper: false,
      actor: true,
      ...extra,
    };
    dots.push(bench);
    return bench;
  };

  const mouth = goalMouth(side);
  const base = { arc: 0, rebound: false };
  let ball: SceneBall | null = null;
  let goalFlash: SceneLayout['goalFlash'] = null;
  let save: SceneLayout['save'] = null;
  let card: SceneLayout['card'] = null;
  let durationMs = 3200;

  switch (scene.type) {
    case 'goal': {
      const from = scene.ownGoal ? zonePoint('six_yard', side) : zonePoint(scene.zone, side);
      markActor(scene.actors[0]);
      ball = { ...base, x1: from.x, y1: from.y, x2: mouth.x, y2: MID_Y - 10, arc: scene.header ? 14 : 6 };
      goalFlash = mouth;
      durationMs = 3600;
      break;
    }
    case 'shot_saved': {
      const from = zonePoint(scene.zone, side);
      markActor(scene.actors[0]);
      const stop = { x: side === 'home' ? SCENE_W - 20 : 20, y: MID_Y + (from.y > MID_Y ? 12 : -12) };
      ball = { ...base, x1: from.x, y1: from.y, x2: stop.x, y2: stop.y, rebound: true, arc: scene.header ? 10 : 4 };
      save = stop;
      break;
    }
    case 'shot_blocked': {
      const from = zonePoint(scene.zone, side);
      markActor(scene.actors[0]);
      // Savunmaya takılan şut yolun üçte birinde kesilir.
      ball = {
        ...base,
        x1: from.x,
        y1: from.y,
        x2: from.x + (mouth.x - from.x) * 0.34,
        y2: from.y + (MID_Y - from.y) * 0.34,
        rebound: true,
      };
      durationMs = 2800;
      break;
    }
    case 'shot_off': {
      const from = zonePoint(scene.zone, side);
      markActor(scene.actors[0]);
      const wideSign = from.y > MID_Y ? 1 : -1;
      // Direkten dönen vuruş kale direğine, ıska kalenin dışına gider.
      const y2 = scene.post ? MID_Y + wideSign * GOAL_HALF : MID_Y + wideSign * (GOAL_HALF + 34);
      ball = { ...base, x1: from.x, y1: from.y, x2: mouth.x, y2, rebound: !!scene.post, arc: scene.header ? 12 : 8 };
      break;
    }
    case 'corner': {
      const from = cornerPoint(scene.zone, side, item.id);
      const to = zonePoint('box_centre', side);
      ball = { ...base, x1: from.x, y1: from.y, x2: to.x, y2: to.y, arc: 26 };
      durationMs = 4000;
      break;
    }
    case 'card_yellow':
    case 'card_red': {
      const dot = markActor(scene.actors[0]);
      const at = dot ?? { x: SCENE_W / 2, y: MID_Y };
      card = { x: at.x, y: at.y, red: scene.type === 'card_red' };
      durationMs = 3000;
      break;
    }
    case 'substitution': {
      markActor(scene.actors[0], { comingOn: true });
      markActor(scene.actors[1], { goingOff: true });
      durationMs = 3000;
      break;
    }
    case 'foul': {
      const dot = markActor(scene.actors[0]);
      markActor(scene.actors[1]);
      ball = dot ? { ...base, x1: dot.x, y1: dot.y, x2: dot.x + (side === 'home' ? 26 : -26), y2: dot.y + 18, arc: 10 } : null;
      durationMs = 2800;
      break;
    }
  }

  return { dots, ball, goalFlash, save, card, durationMs, side };
}

/** Oyuncuların topa doğru hafif kayması (en çok 10 px) — sahne canlı görünsün diye. */
export function drift(dot: SceneDot, ball: SceneBall | null): { dx: number; dy: number } {
  if (!ball) return { dx: 0, dy: 0 };
  const dx = ball.x2 - dot.x;
  const dy = ball.y2 - dot.y;
  const len = Math.hypot(dx, dy) || 1;
  const step = Math.min(10, len / 8);
  return { dx: Math.round((dx / len) * step * 10) / 10, dy: Math.round((dy / len) * step * 10) / 10 };
}
