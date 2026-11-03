/**
 * Temsili anlatım sahnesinin geometrisi — saf modül (diziliş, bölge noktaları, bekleme sahnesi; olay akışı scenePlan.ts). Koordinat verisi YOK
 * (ballCoordinates planda açık ama 10 sn örnekli ve olaylarla uyuşmuyor, 2026-10-21/19746587): oyuncular kadro
 * dizilişinden, top metinden çıkarılan bölgeden. Sahne 504×320 çizilir, kutuya ScaledScene ölçekler.
 */
import type { SceneSide, SceneZone } from '@/services/sportmonks/matchCommentary';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';

export const SCENE_W = 504;
export const SCENE_H = 320;

const MID_Y = SCENE_H / 2;

export type SceneDot = {
  side: SceneSide;
  name: string;
  number: number | null;
  key: string;
  x: number;
  y: number;
  goalkeeper: boolean;
};

export type SceneBall = { x: number; y: number };

/** Bekleme sahnesi yerleşimi (maç öncesi). Olay sahneleri scenePlan.ts'te. */
export type SceneLayout = {
  dots: SceneDot[];
  ball: SceneBall;
};

/** Varsayılan 4-4-2: kadro ya da `formation_field` yoksa. Satır = kaleden ileriye, her satır eşit aralıklı. */
const DEFAULT_ROWS = [1, 4, 4, 2];

/** Oyuncu noktalarının kendi yarı sahasındaki yatay aralığı (kaleciden en ileri oyuncuya). */
const X_NEAR = 18;
const X_FAR = 232;
/** Dikey aralık: kenar çizgilerinden içeride kalsın. */
const Y_NEAR = 34;
const Y_FAR = SCENE_H - 34;

const mirror = (x: number) => SCENE_W - x;

/** Satır içindeki i. oyuncunun (n kişilik satır) dikey yeri; tek kişi ortada. */
function rowY(index: number, count: number): number {
  return Y_NEAR + ((index + 1) / (count + 1)) * (Y_FAR - Y_NEAR);
}

function rowX(row: number, maxRow: number): number {
  if (maxRow <= 1) return X_NEAR;
  return X_NEAR + ((row - 1) / (maxRow - 1)) * (X_FAR - X_NEAR);
}

/**
 * Geometrik taraf: ekranda SOLDAN SAĞA hücum eden "home" yerleşimini kullanır. 2. devrede takımlar taraf değiştirir; 180°
 * döndürülmüş saha, 1. devredeki karşı tarafın geometrisiyle aynıdır (hücum edenin solu yine onun solu) — bu yüzden tüm
 * geometri `lane(side, flip)` ile çağrılır, takım kimliği `side` olarak kalır.
 */
export const lane = (side: SceneSide, flip: boolean): SceneSide => (flip ? (side === 'home' ? 'away' : 'home') : side);

type Placed = { key: string; name: string; number: number | null; goalkeeper: boolean; x: number; y: number };

/**
 * Bir takımın sahadaki oyuncuları (en çok 11) → nokta yerleşimi. Sportmonks `formation_field` "satır:sütun" (satır 1 =
 * kaleci) varsa ondan, yoksa mevkiden (G/D/M/F), o da yoksa 4-4-2. `geo` "home" sola yerleşir (sağa hücum eder), "away"
 * aynalanır (varsayılan: takımın kendi tarafı). Satırdaki kişi sayısı azalırsa (kırmızı kart) satır yeniden aralanır.
 * `key` diziliş yerine bağlı kalıcı kimlik (`home-r2c3`): değişiklikte giren çıkanın yerini ve noktasını devralır.
 */
export function placeSquad(squads: SceneSquads | null, side: SceneSide, geo: SceneSide = side): Placed[] {
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
      push(p.row!, { key: `${side}-r${p.row}c${p.col}`, name: p.name, number: p.number, goalkeeper: p.row === 1, x: 0, y: 0 });
    }
  } else {
    // Mevki bilgisi varsa ondan satır kur (G=1, D=2, M=3, F=4); hiç yoksa adsız 4-4-2.
    const byPos = players.filter((p) => p.pos);
    const order: Record<string, number> = { G: 1, D: 2, M: 3, F: 4 };
    if (byPos.length >= 7) {
      byPos.forEach((p, i) => push(order[p.pos!]!, { key: `${side}-p${i}`, name: p.name, number: p.number, goalkeeper: p.pos === 'G', x: 0, y: 0 }));
    } else {
      let i = 0;
      DEFAULT_ROWS.forEach((count, row) => {
        for (let n = 0; n < count; n++, i++) {
          const p = players[i];
          push(row + 1, { key: `${side}-d${i}`, name: p?.name ?? '', number: p?.number ?? null, goalkeeper: row === 0, x: 0, y: 0 });
        }
      });
    }
  }

  const maxRow = Math.max(...rows.keys());
  const out: Placed[] = [];
  for (const [row, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const x = rowX(row, maxRow);
    list.forEach((p, index) => {
      out.push({ ...p, x: geo === 'home' ? x : mirror(x), y: geo === 'home' ? rowY(index, list.length) : rowY(list.length - 1 - index, list.length) });
    });
  }
  return out;
}

/** Bölge → topun çıkış noktası. Sol/sağ HÜCUM EDEN oyuncunun bakışına göre; `side` geometrik taraf (bkz. `lane`). */
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
 * Maç başlamadan önce gösterilen bekleme sahnesi: iki takım kendi yarısında dizili, top orta noktada. Olay yok —
 * animasyon bileşende (nefes alan noktalar + orta yuvarlakta halka). Kadro gelmediği için (maç öncesi uç çağrılmıyor)
 * yerleşim varsayılan 4-4-2'dir.
 */
export function buildKickoffScene(squads: SceneSquads | null = null): SceneLayout {
  const dots: SceneDot[] = [];
  for (const side of ['home', 'away'] as const) {
    for (const p of placeSquad(squads, side)) dots.push({ side, key: p.key, name: p.name, number: p.number, x: p.x, y: p.y, goalkeeper: p.goalkeeper });
  }
  return { dots, ball: { x: SCENE_W / 2, y: MID_Y } };
}
