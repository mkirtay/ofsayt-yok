/**
 * Sahne tutarlılık kuralları — saf modül. Plan (scenePlan.ts) başlangıç dizilişini ve duran top yerleşimlerini çizmeden önce
 * buradan geçirir (`fix`); testler ve geliştirme modu olay anındaki kareyi yalnız denetler (`fix: false`).
 *
 * Kurallar (sahne hücum çerçevesinde: u 0 = hücum edenin kendi kalesi … 1 = rakip kale; s -1 sol … +1 sağ):
 * - Ofsayt: olay ofsayt değilse hücum eden hiçbir oyuncu rakip yarıda hem ikinci son savunmacının hem topun önünde
 *   olmaz (çizgiye çekilir). Ofsayt olayında ofsayttaki oyuncu çizginin önündedir.
 * - Kaleci: savunan kaleci kendi ceza sahasında (penaltıda çizgide); hücum edenin kalecisi orta sahayı geçmez (son
 *   dakikalar hariç).
 * - Çakışma: iki nokta arası en az `minGap` (nokta çapı × 1,2); temas hâlindeki çift (müdahale, hava topu) hariç.
 * - Sayı: her takımda beklenen kişi (11, kırmızı karttan sonra 10). Düzeltilemez, yalnız bildirilir.
 * - Saha sınırı: oyuncular saha içinde (korner kullananı hariç).
 * - Şut: vuran topun yanında; savunan takımın en az 4 oyuncusu ceza sahası ve yakınında; hücum edenin en geri
 *   oyuncuları kendi kalesine yapışık değil.
 * - Penaltı: atan ve kaleci dışında herkes ceza sahası ve yayın dışında.
 */
import type { SceneSide } from '@/services/sportmonks/matchCommentary';
import { SCENE_H, SCENE_W } from './sceneLayout';

type Vec = { x: number; y: number };

/** Nokta çapı (sahne px) ve en küçük aralık. */
export const DOT = 18;
export const MIN_GAP = Math.round(DOT * 1.2 * 10) / 10;
/** Ofsayt çizgisinin gerisinde bırakılan pay (u). */
export const OFFSIDE_MARGIN = 0.012;
/** Aynı hiza payı (u ≈ 5 px ≈ 1 m): bu kadar önde olmak ofsayt sayılmaz. */
export const LEVEL = 0.01;

/** Saha çizgileri (CommentaryScene PitchLines ile aynı): kenar 6 px, ceza sahası 79×190, penaltı noktası 56 px içeride. */
const EDGE = 6;
const BOX_DEPTH = (85 / SCENE_W);
const BOX_HALF = 95 / (SCENE_H / 2 - 14);
const SPOT_U = 1 - 62 / SCENE_W;
const ARC_R = 44;

const MID_Y = SCENE_H / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Hücum çerçevesi: `geo` "home" ise soldan sağa hücum (bkz. sceneLayout `lane`). scenePlan.frame ile aynı dönüşüm. */
export function frameOf(geo: SceneSide) {
  const flip = geo === 'home' ? 1 : -1;
  return {
    P: (u: number, s: number): Vec => ({ x: geo === 'home' ? u * SCENE_W : (1 - u) * SCENE_W, y: MID_Y + s * flip * (MID_Y - 14) }),
    u: (p: Vec) => (geo === 'home' ? p.x / SCENE_W : 1 - p.x / SCENE_W),
    s: (p: Vec) => ((p.y - MID_Y) / (MID_Y - 14)) * flip,
  };
}

export type RuleBody = {
  side: SceneSide;
  goalkeeper: boolean;
  pos: Vec;
  /** Plan rolüyle yerleşmiş (vuran, kullanan, ofsayttaki): düzeltmede yerinden oynatılmaz (zorunlu kurallar hariç). */
  fixed?: boolean;
  /** Temas hâlinde (müdahale, hava topu): bu bayraklı iki oyuncu arasında çakışma aranmaz. */
  contact?: boolean;
};

export type ScenePhase = 'open' | 'shot' | 'corner' | 'penalty' | 'dead';

export type SceneCheck = {
  bodies: RuleBody[];
  ball: Vec | null;
  /** Topa sahip (hücum eden) takım. */
  attack: SceneSide;
  /** Hücum edenin geometrik tarafı ("home" = sağa hücum). */
  geo: SceneSide;
  phase: ScenePhase;
  /** Vuran / penaltıyı kullanan oyuncu (şut ve penaltı aşamasında topun yanında olmalı). */
  shooter?: number | null;
  /** Ofsayt olayında ofsayttaki oyuncu; doluysa ofsayt kuralı tersine işler. */
  offsider?: number | null;
  /** Beklenen kişi sayısı (kırmızı karttan sonra 10). */
  expected?: Partial<Record<SceneSide, number>>;
  /** Son dakikalar: hücum edenin kalecisi ileri çıkabilir. */
  lateGame?: boolean;
  minGap?: number;
};

export type RuleName = 'offside' | 'keeper' | 'overlap' | 'count' | 'bounds' | 'shooter' | 'phase' | 'penalty';
export type Violation = { rule: RuleName; i?: number; detail: string };

/** Hücum çerçevesinde ofsayt çizgisi: savunan takımın (kaleci dahil) ikinci son oyuncusu. */
export function offsideLine(bodies: readonly Pick<RuleBody, 'side' | 'pos'>[], attack: SceneSide, geo: SceneSide): number {
  const A = frameOf(geo);
  const us = bodies
    .filter((b) => b.side !== attack)
    .map((b) => A.u(b.pos))
    .sort((a, b) => b - a);
  return us[1] ?? us[0] ?? 1;
}

/** `p` ceza sahası içinde mi (savunan kalenin önündeki; hücum çerçevesinde u ≥ 1 − kutu derinliği). */
const inBox = (u: number, s: number) => u >= 1 - BOX_DEPTH && Math.abs(s) <= BOX_HALF;

function detect(c: SceneCheck, pos: Vec[]): Violation[] {
  const out: Violation[] = [];
  const A = frameOf(c.geo);
  const D = frameOf(c.geo === 'home' ? 'away' : 'home');
  const gap = c.minGap ?? MIN_GAP;
  const ballU = c.ball ? A.u(c.ball) : 0.5;
  const bodies = c.bodies.map((b, i) => ({ ...b, pos: pos[i]! }));

  // Sayı.
  for (const side of ['home', 'away'] as const) {
    const want = c.expected?.[side];
    const have = bodies.filter((b) => b.side === side).length;
    if (want != null && have !== want) out.push({ rule: 'count', detail: `${side}: ${have}/${want}` });
  }

  // Saha sınırı.
  bodies.forEach((b, i) => {
    if (c.phase === 'corner' && b.fixed) return;
    if (b.pos.x < EDGE || b.pos.x > SCENE_W - EDGE || b.pos.y < EDGE || b.pos.y > SCENE_H - EDGE) out.push({ rule: 'bounds', i, detail: 'saha dışında' });
  });

  // Ofsayt (köşe vuruşu ve penaltıda kural yok; duran oyunda da yok).
  if (c.phase === 'open' || c.phase === 'shot') {
    const line = offsideLine(bodies, c.attack, c.geo);
    const limit = Math.max(line, ballU);
    bodies.forEach((b, i) => {
      if (b.side !== c.attack) return;
      const u = A.u(b.pos);
      // Aynı hizada (≈1 m, 0,01 u) olmak ofsayt değildir.
      const ahead = u > 0.5 && u > limit + LEVEL;
      if (i === c.offsider) {
        if (!ahead) out.push({ rule: 'offside', i, detail: 'ofsayttaki oyuncu çizginin gerisinde' });
      } else if (ahead) out.push({ rule: 'offside', i, detail: `çizginin önünde (${u.toFixed(3)} > ${limit.toFixed(3)})` });
    });
  }

  // Kaleciler.
  bodies.forEach((b, i) => {
    if (!b.goalkeeper) return;
    if (b.side === c.attack) {
      if (!c.lateGame && A.u(b.pos) > 0.5) out.push({ rule: 'keeper', i, detail: 'hücum edenin kalecisi orta sahayı geçti' });
    } else {
      const u = D.u(b.pos);
      const s = D.s(b.pos);
      if (u > BOX_DEPTH || Math.abs(s) > BOX_HALF) out.push({ rule: 'keeper', i, detail: 'savunan kaleci ceza sahası dışında' });
      if (c.phase === 'penalty' && u > 0.03) out.push({ rule: 'keeper', i, detail: 'penaltıda kaleci çizgide değil' });
    }
  });

  // Vuran topun yanında.
  if ((c.phase === 'shot' || c.phase === 'penalty') && c.shooter != null && c.ball) {
    const d = Math.hypot(bodies[c.shooter]!.pos.x - c.ball.x, bodies[c.shooter]!.pos.y - c.ball.y);
    if (d > 16) out.push({ rule: 'shooter', i: c.shooter, detail: `vuran topa ${d.toFixed(0)} px uzak` });
  }

  // Şut anı: savunanın en az 4 oyuncusu ceza sahası ve yakınında; hücum edenin geridekileri kaleye yapışık değil.
  if (c.phase === 'shot') {
    const near = bodies.filter((b) => b.side !== c.attack && A.u(b.pos) >= 1 - BOX_DEPTH - 0.08 && Math.abs(A.s(b.pos)) <= BOX_HALF + 0.2).length;
    if (near < 4) out.push({ rule: 'phase', detail: `ceza sahası çevresinde ${near} savunan` });
    bodies.forEach((b, i) => {
      if (b.side === c.attack && !b.goalkeeper && A.u(b.pos) < 0.28) out.push({ rule: 'phase', i, detail: 'hücum edenin oyuncusu kendi kalesine yapışık' });
    });
  }

  // Penaltı: atan ve savunan kaleci dışında herkes ceza sahası ve yay dışında.
  if (c.phase === 'penalty') {
    const spot = A.P(SPOT_U, 0);
    bodies.forEach((b, i) => {
      if (i === c.shooter || (b.goalkeeper && b.side !== c.attack)) return;
      const u = A.u(b.pos);
      const s = A.s(b.pos);
      if (inBox(u, s) || Math.hypot(b.pos.x - spot.x, b.pos.y - spot.y) < ARC_R) out.push({ rule: 'penalty', i, detail: 'penaltıda ceza sahası / yay içinde' });
    });
  }

  // Çakışma.
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (bodies[i]!.contact && bodies[j]!.contact) continue;
      const d = Math.hypot(bodies[i]!.pos.x - bodies[j]!.pos.x, bodies[i]!.pos.y - bodies[j]!.pos.y);
      if (d < gap - 0.5) out.push({ rule: 'overlap', i, detail: `${i}–${j} arası ${d.toFixed(1)} px` });
    }
  }
  return out;
}

/** Kurala uymayanları en yakın uygun yere çeker (çakışma, kaleci, ofsayt, penaltı yerleşimi, saha sınırı). */
function repair(c: SceneCheck, pos: Vec[]): void {
  const A = frameOf(c.geo);
  const D = frameOf(c.geo === 'home' ? 'away' : 'home');
  const gap = c.minGap ?? MIN_GAP;
  const ballU = c.ball ? A.u(c.ball) : 0.5;
  const movable = (i: number) => !c.bodies[i]!.fixed;

  const keepers = () =>
    c.bodies.forEach((b, i) => {
      if (!b.goalkeeper) return;
      if (b.side === c.attack) {
        if (!c.lateGame && A.u(pos[i]!) > 0.45) pos[i] = A.P(0.45, A.s(pos[i]!));
        return;
      }
      const maxU = c.phase === 'penalty' ? 0.02 : BOX_DEPTH - 0.02;
      pos[i] = D.P(clamp(D.u(pos[i]!), 0.02, maxU), clamp(D.s(pos[i]!), -BOX_HALF + 0.1, BOX_HALF - 0.1));
    });

  const onside = () => {
    if (c.phase !== 'open' && c.phase !== 'shot') return;
    const line = offsideLine(c.bodies.map((b, i) => ({ side: b.side, pos: pos[i]! })), c.attack, c.geo);
    const limit = Math.max(line, ballU) - OFFSIDE_MARGIN;
    c.bodies.forEach((b, i) => {
      if (b.side !== c.attack || i === c.shooter) return;
      const u = A.u(pos[i]!);
      if (i === c.offsider) {
        if (u <= limit + OFFSIDE_MARGIN + 0.002) pos[i] = A.P(limit + 2 * OFFSIDE_MARGIN + 0.02, A.s(pos[i]!));
      } else if (u > 0.5 && u > limit + OFFSIDE_MARGIN) pos[i] = A.P(limit, A.s(pos[i]!));
    });
  };

  const shooter = () => {
    if ((c.phase !== 'shot' && c.phase !== 'penalty') || c.shooter == null || !c.ball) return;
    const p = pos[c.shooter]!;
    const d = Math.hypot(p.x - c.ball.x, p.y - c.ball.y);
    if (d > 16) pos[c.shooter] = A.P(A.u(c.ball) - 0.012, A.s(c.ball));
  };

  const phase = () => {
    if (c.phase === 'shot') {
      // En az 4 savunan ceza sahası çevresinde: kaleye en yakın saha oyuncuları kutunun önüne.
      const def = c.bodies
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.side !== c.attack && !b.goalkeeper)
        .sort((a, b) => A.u(pos[b.i]!) - A.u(pos[a.i]!));
      const near = (i: number) => A.u(pos[i]!) >= 1 - BOX_DEPTH - 0.08 && Math.abs(A.s(pos[i]!)) <= BOX_HALF + 0.2;
      let count = def.filter(({ i }) => near(i)).length + c.bodies.filter((b, i) => b.side !== c.attack && b.goalkeeper && near(i)).length;
      for (const { i } of def) {
        if (count >= 4) break;
        if (near(i) || !movable(i)) continue;
        pos[i] = A.P(1 - BOX_DEPTH - 0.03, clamp(A.s(pos[i]!), -BOX_HALF, BOX_HALF));
        count++;
      }
      c.bodies.forEach((b, i) => {
        if (b.side === c.attack && !b.goalkeeper && movable(i) && A.u(pos[i]!) < 0.3) pos[i] = A.P(0.3, A.s(pos[i]!));
      });
    }
    if (c.phase === 'penalty') {
      const spot = A.P(SPOT_U, 0);
      c.bodies.forEach((b, i) => {
        if (i === c.shooter || (b.goalkeeper && b.side !== c.attack)) return;
        let u = A.u(pos[i]!);
        let s = A.s(pos[i]!);
        if (inBox(u, s)) {
          // Ceza sahası çizgisinin hemen dışına (yan kenara yakınsa yana, değilse öne).
          if (Math.abs(s) > BOX_HALF - 0.12) s = Math.sign(s || 1) * (BOX_HALF + 0.1);
          else u = 1 - BOX_DEPTH - 0.04;
        }
        let p = A.P(u, s);
        const d = Math.hypot(p.x - spot.x, p.y - spot.y);
        if (d < ARC_R + 10) {
          const k = (ARC_R + 12) / Math.max(1, d);
          p = { x: spot.x + (p.x - spot.x) * k, y: spot.y + (p.y - spot.y) * k };
          if (inBox(A.u(p), A.s(p))) p = A.P(1 - BOX_DEPTH - 0.025, A.s(p));
        }
        pos[i] = p;
      });
    }
  };

  const bounds = () =>
    c.bodies.forEach((b, i) => {
      if (c.phase === 'corner' && b.fixed) return;
      pos[i] = { x: clamp(pos[i]!.x, EDGE + 6, SCENE_W - EDGE - 6), y: clamp(pos[i]!.y, EDGE + 6, SCENE_H - EDGE - 6) };
    });

  const spread = () => {
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          if (c.bodies[i]!.contact && c.bodies[j]!.contact) continue;
          const dx = pos[j]!.x - pos[i]!.x;
          const dy = pos[j]!.y - pos[i]!.y;
          const d = Math.hypot(dx, dy);
          if (d >= gap) continue;
          const nx = d > 1e-3 ? dx / d : Math.cos(i * 2.39 + j);
          const ny = d > 1e-3 ? dy / d : Math.sin(i * 2.39 + j);
          const need = gap - d + 0.3;
          const wi = movable(i) ? (movable(j) ? 0.5 : 1) : 0;
          const wj = movable(j) ? (movable(i) ? 0.5 : 1) : 0;
          if (wi + wj === 0) continue;
          pos[i] = { x: pos[i]!.x - nx * need * wi, y: pos[i]!.y - ny * need * wi };
          pos[j] = { x: pos[j]!.x + nx * need * wj, y: pos[j]!.y + ny * need * wj };
          moved = true;
        }
      }
      if (!moved) break;
    }
  };

  for (let round = 0; round < 3; round++) {
    phase();
    keepers();
    shooter();
    onside();
    spread();
    bounds();
  }
  // Son geçiş: zorunlu kurallar (ofsayt, kaleci, penaltı) çakışma itmesinden sonra da geçerli kalsın.
  phase();
  keepers();
  onside();
  bounds();
}

/**
 * Sahne karesini denetler; `fix` (varsayılan) ise uymayanları düzeltir. `violations` düzeltmeden önceki, `remaining`
 * sonraki ihlaller (sayı ihlali düzeltilemez). Konumlar yeni dizi olarak döner; girdi değişmez.
 */
export function validateScene(c: SceneCheck, { fix = true }: { fix?: boolean } = {}): { positions: Vec[]; violations: Violation[]; remaining: Violation[] } {
  const pos = c.bodies.map((b) => ({ ...b.pos }));
  const violations = detect(c, pos);
  if (!fix || violations.length === 0) return { positions: pos, violations, remaining: violations };
  repair(c, pos);
  return { positions: pos, violations, remaining: detect(c, pos) };
}
