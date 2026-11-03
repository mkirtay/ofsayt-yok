/**
 * Anlatım sahnesinin hareket durumu — saf modül (plan scenePlan.ts'te, çizim CommentaryScene.tsx'te). Her oyuncu kalıcı
 * kimlik (`home-3`, `ref`…), konum ve hızla tutulur; plan yalnız hedef ve tempo verir. Adım geçen zamana bağlıdır
 * (kareye değil), tek adım en fazla MAX_DT ms ilerler: sekme arka plandan dönünce oyuncular sahayı bir anda geçmez.
 *
 * - Hız/ivme sınırı, hedefe yaklaşırken frenleme, keskin dönüşte yavaşlama.
 * - Takım şekli hedefleri yumuşatılır ve 3 px altındaki değişimler yok sayılır (titreme / sağa-sola salınım olmaz).
 * - Ölçülü ayrıştırma: `gap`ten (nokta çapı, ekranda büyütülmüşse o kadar) yakın iki oyuncu hafifçe itilir (temas hareketleri
 *   hariç); fizik motoru yok.
 * - Ofsayt: şekilden yürüyen hücumcunun hedefi, savunanların o anki ikinci son oyuncusu ve top çizgisini geçmez.
 * - Top kendi zaman çizelgesiyle uçar; sürerken sahibine bağlıdır, uçuşta bağımsızdır; alıcı topa yetişmeden top ona geçmez.
 * - Yeni sahne önceki durumdan devam eder: yakınsa oyuncular kısa bir girişte yerlerine koşar, çok uzaksa kısa bir
 *   kararma geçişi (ışınlanma yerine açıkça sahne değişimi).
 */
import { SCENE_H, SCENE_W, lane } from './sceneLayout';
import { PACE, dist, frame, lerp, refereeSpot, shapeAt, type BallSeg, type Move, type Pace, type ScenePlan, type Vec } from './scenePlan';
import { MIN_GAP, OFFSIDE_MARGIN, offsideLine } from './sceneRules';

/** Tek adımın en büyük süresi (ms). */
export const MAX_DT = 50;
/** İvme (px/s²): normal / kaleci uzanışı. Fren ivmesi daha düşük: varışta yumuşak yavaşlama. */
const ACCEL = 170;
const DIVE_ACCEL = 900;
const BRAKE = 120;
/** Yakın oyuncuların varsayılan ayrıştırma mesafesi (px): kuraldaki en küçük aralık (nokta çapı × 1,2) + pay. */
export const SEPARATION = MIN_GAP + 0.5;
/** Kesin ayırma eşiği (`gap` oranı): bunun altına inen çift anında ayrılır (≈ nokta çapı). */
const HARD_GAP = 0.86;
/** Bundan uzak yerleşimde kısa kararma geçişi (px). */
export const CUT_DISTANCE = 150;
const CUT_OUT = 180;
const CUT_IN = 280;
const MAX_LEAD_IN = 1300;
const MAX_ROLE_LEAD_IN = 2600;
/** Top bundan uzaktaysa (ya da duran topta 12 px) top kısa sönüp yeni yerinde belirir. */
const BALL_CUT = 70;

/** `off`: ayrıştırmanın şekil hedefine eklediği kalıcı kayma (yavaş söner) — itilen oyuncu aynı noktaya geri dönmeye çalışıp titremez. */
export type Body = { key: string; pos: Vec; vel: Vec; goal: Vec | null; filt: Vec | null; opacity: number; off: Vec };

export type BallState = {
  pos: Vec;
  lift: number;
  owner: number | null;
  seg: number;
  from: Vec | null;
  facing: Vec;
  opacity: number;
  /** Top geçişi: sönme/belirme sayacı (ms) ve hedefi. */
  cut: { t: number; to: Vec } | null;
  /** Girişte topun yuvarlandığı nokta. */
  lead: { from: Vec; to: Vec } | null;
};

export type World = {
  plan: ScenePlan;
  /** Plan zamanı (ms); girişte negatif. */
  t: number;
  leadIn: number;
  /** Sahne kararma geçişi (ms sayaç) — null: yok. */
  cut: number | null;
  layerOpacity: number;
  bodies: Body[];
  ball: BallState;
  ballRef: Vec;
  presser: number | null;
  trailFrom: (Vec | null)[];
  swapped: boolean;
  resting: boolean;
  /** Ayrıştırma mesafesi (px); bileşen dar ekranda noktalar büyüyünce artırır. */
  gap: number;
  /** Bu karedeki ofsayt sınırı (hücum çerçevesinde u); oyun duruksa 1. */
  line: number;
};

const ZERO: Vec = { x: 0, y: 0 };
const len = (v: Vec) => Math.hypot(v.x, v.y);

function initialOpacity(plan: ScenePlan, i: number): number {
  if (plan.agents[i]!.sub) return plan.fades.some((f) => f.i === i && f.t <= 0 && f.to === 1) ? 1 : 0;
  return 1;
}

/**
 * Yeni plan için dünya. `prev` verilirse oyuncular kimlikleriyle eşlenir ve kaldıkları yerden devam eder; yoksa plan
 * başlangıcına yerleşir (ilk açılış).
 */
export function createWorld(plan: ScenePlan, prev: World | null = null): World {
  if (prev && prev.plan.swap && !prev.swapped) applySwap(prev);
  const byKey = new Map(prev?.bodies.map((b) => [b.key, b]) ?? []);
  const bodies: Body[] = plan.agents.map((a, i) => {
    const old = byKey.get(a.key);
    const start = plan.start.players[i]!;
    // Kenardaki yedek her sahnede kendi başlangıcından (çıkıp girdiği yerden) başlar.
    if (!old || a.sub) return { key: a.key, pos: { ...start }, vel: { ...ZERO }, goal: null, filt: null, opacity: initialOpacity(plan, i), off: { ...ZERO } };
    return { key: a.key, pos: { ...old.pos }, vel: { ...old.vel }, goal: null, filt: null, opacity: 1, off: { ...old.off } };
  });
  const ballStart = plan.start.ball;
  const prevBall = prev?.ball.pos ?? ballStart ?? { x: SCENE_W / 2, y: 160 };
  const world: World = {
    plan,
    t: 0,
    leadIn: 0,
    cut: null,
    layerOpacity: 1,
    bodies,
    ball: { pos: { ...prevBall }, lift: 0, owner: null, seg: -1, from: null, facing: { x: 1, y: 0 }, opacity: 1, cut: null, lead: null },
    ballRef: { ...prevBall },
    presser: null,
    trailFrom: plan.trails.map(() => null),
    swapped: false,
    resting: false,
    gap: prev?.gap ?? SEPARATION,
    line: 1,
  };
  if (!prev) {
    world.ball.pos = { ...(ballStart ?? prevBall) };
    world.ballRef = { ...world.ball.pos };
    return world;
  }

  // Uzaklık: tek tük uzak oyuncu (kaleci, hakem) yüzünden kararma olmasın — üçüncü en uzak ve en uzak birlikte bakılır.
  const gaps = bodies
    .map((b, i) => (plan.agents[i]!.sub ? 0 : dist(b.pos, plan.start.players[i]!)))
    .sort((a, b) => b - a);
  if ((gaps[2] ?? 0) > CUT_DISTANCE || (gaps[0] ?? 0) > CUT_DISTANCE * 1.8) {
    world.cut = 0;
    return world;
  }
  const far = gaps[2] ?? 0;
  world.leadIn = Math.min(MAX_LEAD_IN, (far / PACE.run) * 1000 + (far > 4 ? 250 : 0));
  // Rolü olanlar (top sahibi, vuran, ilk saniyede koşan) başlangıç yerine yetişmeli: uzaksa giriş uzar, çok uzaksa kararma.
  const roles = roleAgents(plan);
  const roleGap = Math.max(0, ...[...roles].map((i) => dist(bodies[i]!.pos, plan.start.players[i]!)));
  if (roleGap > CUT_DISTANCE) {
    world.cut = 0;
    return world;
  }
  if (roleGap > 4) world.leadIn = Math.max(world.leadIn, Math.min(MAX_ROLE_LEAD_IN, (roleGap / PACE.sprint) * 1000 + 350));
  if (ballStart) {
    const d = dist(world.ball.pos, ballStart);
    if (d > BALL_CUT || (plan.start.ballDead && d > 12)) world.ball.cut = { t: 0, to: { ...ballStart } };
    else if (d > 1) {
      world.leadIn = Math.max(world.leadIn, Math.min(MAX_LEAD_IN, (d / 150) * 1000 + 200));
      world.ball.lead = { from: { ...world.ball.pos }, to: { ...ballStart } };
    }
  }
  world.t = -world.leadIn;
  return world;
}

/** Planda rolü olan oyuncular: topu tutan / süren, denetim anındaki vuran, ilk yarım saniyede rol hedefi olanlar. */
function roleAgents(plan: ScenePlan): Set<number> {
  const out = new Set<number>();
  for (const s of plan.ball) if (s.kind === 'carry' || s.kind === 'hold') out.add(s.owner);
  if (plan.check?.shooter != null) out.add(plan.check.shooter);
  for (const m of plan.moves) if (m.t0 < 500 && !plan.agents[m.i]!.referee && !plan.agents[m.i]!.sub) out.add(m.i);
  return out;
}

function applySwap(w: World) {
  const s = w.plan.swap;
  if (!s || w.swapped) return;
  const from = w.bodies[s.from]!;
  const into = w.bodies[s.into]!;
  into.pos = { ...from.pos };
  into.vel = { ...from.vel };
  into.goal = null;
  into.filt = null;
  into.opacity = 1;
  from.opacity = 0;
  from.vel = { ...ZERO };
  w.swapped = true;
}

/** `i` için `t` anında geçerli rol hedefi (en son başlayan). */
export function activeMove(moves: readonly Move[], i: number, t: number): Move | null {
  let best: Move | null = null;
  for (const m of moves) if (m.i === i && m.t0 <= t && t < m.t1 && (!best || m.t0 >= best.t0)) best = m;
  return best;
}

function activeSeg(segs: readonly BallSeg[], t: number): number {
  let idx = -1;
  for (let k = 0; k < segs.length; k++) if (segs[k]!.t0 <= t) idx = k;
  return idx;
}

/**
 * Hız/ivme sınırlı yönelme (dt saniye). Hedefe yaklaşınca fren profiliyle yavaşlar; hız ile istenen yön arasındaki açı
 * büyüdükçe istenen hız düşer (keskin dönüşte yavaşlama). Hedefte ve yavaşken durur — salınım yok.
 */
export function steer(b: Body, target: Vec, maxSpeed: number, accel: number, dt: number) {
  const dx = target.x - b.pos.x;
  const dy = target.y - b.pos.y;
  const d = Math.hypot(dx, dy);
  const sp = len(b.vel);
  if (d < 0.8 && sp < Math.min(5, accel * dt)) {
    b.vel = { ...ZERO };
    return;
  }
  let desired = Math.min(maxSpeed, Math.sqrt(2 * BRAKE * Math.max(0, d - 0.5)));
  const dir = d > 1e-6 ? { x: dx / d, y: dy / d } : ZERO;
  if (sp > 1) {
    const cos = (b.vel.x * dir.x + b.vel.y * dir.y) / sp;
    desired *= 0.55 + 0.45 * Math.max(0, cos);
  }
  let ax = dir.x * desired - b.vel.x;
  let ay = dir.y * desired - b.vel.y;
  const dv = Math.hypot(ax, ay);
  const maxDv = accel * dt;
  if (dv > maxDv) {
    ax = (ax / dv) * maxDv;
    ay = (ay / dv) * maxDv;
  }
  b.vel = { x: b.vel.x + ax, y: b.vel.y + ay };
  b.pos = { x: b.pos.x + b.vel.x * dt, y: b.pos.y + b.vel.y * dt };
}

const ease = (style: string, k: number) => {
  switch (style) {
    case 'cross':
      return k;
    case 'shot':
    case 'out':
      return 1 - Math.pow(1 - k, 1.35);
    default:
      return 1 - Math.pow(1 - k, 2);
  }
};

/** Dünyayı `dtMs` ilerletir (en fazla MAX_DT). */
export function stepWorld(w: World, dtMs: number): void {
  const step = Math.min(Math.max(0, dtMs), MAX_DT);
  if (step === 0) return;
  const plan = w.plan;

  // Sahne kararma geçişi: sön → yeni başlangıca yerleş → belir. Bu sırada plan zamanı akmaz.
  if (w.cut != null) {
    const before = w.cut;
    w.cut += step;
    if (before < CUT_OUT && w.cut >= CUT_OUT) {
      w.bodies.forEach((b, i) => {
        b.pos = { ...plan.start.players[i]! };
        b.vel = { ...ZERO };
        b.goal = null;
        b.filt = null;
        b.opacity = initialOpacity(plan, i);
      });
      if (plan.start.ball) w.ball.pos = { ...plan.start.ball };
      w.ballRef = { ...w.ball.pos };
    }
    w.layerOpacity = w.cut < CUT_OUT ? 1 - w.cut / CUT_OUT : Math.min(1, (w.cut - CUT_OUT) / CUT_IN);
    if (w.cut >= CUT_OUT + CUT_IN) {
      w.cut = null;
      w.layerOpacity = 1;
    }
    return;
  }

  const dt = step / 1000;
  w.t += step;
  const t = w.t;

  // Top durumu (hedefler topa göre).
  updateBall(w, step);
  w.ballRef = lerp(w.ballRef, w.ball.pos, 1 - Math.exp(-step / 650));

  // Baskı: topa sahip hücumcuya en yakın savunmacı (kararlılık için %30 histerezis).
  const owner = w.ball.owner;
  const defend = plan.side === 'home' ? 'away' : 'home';
  if (plan.inPlay && t >= 0 && t < plan.actionEndMs && owner != null && plan.agents[owner]?.side === plan.side) {
    let best = -1;
    let bestD = Infinity;
    plan.agents.forEach((a, i) => {
      if (a.side !== defend || a.goalkeeper || activeMove(plan.moves, i, t)) return;
      const d = dist(w.bodies[i]!.pos, w.ball.pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const cur = w.presser;
    if (cur == null || activeMove(plan.moves, cur, t) || (best >= 0 && bestD < 0.7 * dist(w.bodies[cur]!.pos, w.ball.pos))) w.presser = best >= 0 ? best : null;
  } else w.presser = null;

  const settling = t >= plan.actionEndMs;
  // Ofsayt sınırı (hücum çerçevesinde u): savunanların o anki ikinci son oyuncusu ya da top, eksi pay.
  const A = frame(plan.side, plan.flip);
  const line = plan.inPlay
    ? Math.max(
        offsideLine(
          w.bodies.map((b, i) => ({ side: plan.agents[i]!.side ?? plan.side, pos: b.pos })).filter((_, i) => !plan.agents[i]!.referee && !plan.agents[i]!.sub && w.bodies[i]!.opacity > 0.5),
          plan.side,
          lane(plan.side, plan.flip),
        ),
        A.u(w.ball.pos),
      ) - OFFSIDE_MARGIN
    : 1;
  w.line = Math.min(line, plan.holdLine ?? 1);
  w.bodies.forEach((b, i) => {
    const agent = plan.agents[i]!;
    let target: Vec;
    let pace: Pace;
    let forced = false;
    const m = t >= 0 ? activeMove(plan.moves, i, t) : null;
    const seg = w.ball.seg >= 0 ? plan.ball[w.ball.seg] : undefined;
    const ownsSeg = t >= 0 && seg && (seg.kind === 'carry' || seg.kind === 'hold') && seg.owner === i;
    if (t < 0) {
      target = plan.start.players[i]!;
      pace = 'run';
      forced = true;
    } else if (m) {
      target = m.to;
      pace = m.pace;
      forced = true;
    } else if (ownsSeg) {
      // Top sahibi: topa uzaksa önce topu alır; sonra sürer ya da tutar.
      if (w.ball.owner !== i) {
        target = w.ball.pos;
        pace = 'run';
      } else if (seg.kind === 'carry') {
        target = seg.to;
        pace = 'dribble';
      } else {
        target = b.pos;
        pace = 'walk';
      }
      forced = true;
    } else if (agent.sub) {
      target = b.pos;
      pace = 'walk';
    } else if (agent.referee) {
      target = refereeSpot(plan.side, w.ballRef, plan.flip);
      pace = plan.inPlay && !settling ? 'run' : 'jog';
    } else if (i === w.presser) {
      // Topla kendi kalesi arasında, 15 px yakında.
      const ownGoal = frame(defend, plan.flip).P(0, 0);
      target = lerp(w.ball.pos, ownGoal, 15 / Math.max(15, dist(w.ball.pos, ownGoal)));
      pace = 'run';
      forced = true;
    } else if (settling && plan.settle === 'kickoff') {
      target = agent.home;
      pace = 'jog';
    } else {
      target = shapeAt(agent, plan.side, w.ballRef, plan.flip);
      pace = plan.inPlay && !settling ? (dist(b.pos, target) > 40 ? 'run' : 'jog') : dist(b.pos, target) > 30 ? 'jog' : 'walk';
    }

    // Şekil hedefleri: yumuşatma + 3 px ölü bölge (küçük değişimde yön değiştirmez). Rol hedefleri doğrudan.
    if (forced) {
      b.goal = target;
      b.filt = null;
    } else {
      b.filt = b.filt ? lerp(b.filt, target, 1 - Math.exp(-step / 300)) : { ...target };
      // Kayma yavaş söner; plan bitince donar (yeni veri yokken hareket üretmez).
      if (t < plan.durationMs) b.off = { x: b.off.x * Math.exp(-step / 6000), y: b.off.y * Math.exp(-step / 6000) };
      let want = { x: b.filt.x + b.off.x, y: b.filt.y + b.off.y };
      if (agent.side === plan.side && !agent.goalkeeper && A.u(want) > 0.5 && A.u(want) > w.line) want = A.P(Math.max(0.5, w.line), A.s(want));
      if (!b.goal || dist(want, b.goal) > 3) b.goal = want;
    }
    steer(b, b.goal, PACE[pace], pace === 'dive' ? DIVE_ACCEL : ACCEL, dt);
  });

  separate(w, dt);
  // Oyuncular saha içinde kalır (itme kimseyi çizgi dışına atmaz); rol hedefi saha dışı olanlar (kenara çıkan) hariç.
  w.bodies.forEach((b, i) => {
    const m = activeMove(plan.moves, i, t);
    if (plan.agents[i]!.sub || (m && (m.to.x < 10 || m.to.x > SCENE_W - 10 || m.to.y < 10 || m.to.y > SCENE_H - 10))) return;
    b.pos = { x: Math.min(SCENE_W - 9, Math.max(9, b.pos.x)), y: Math.min(SCENE_H - 9, Math.max(9, b.pos.y)) };
  });
  updateFades(w);
  if (plan.swap && !w.swapped && t >= plan.durationMs) applySwap(w);
  // Dinlenme: plan bitti ve herkes durdu (ayrıştırmanın tuttuğu ufak farklar hareket sayılmaz) → döngü durur.
  w.resting =
    t >= plan.durationMs &&
    w.ball.cut == null &&
    (w.ball.seg < 0 || plan.ball[w.ball.seg]!.kind !== 'flight' || t >= plan.ball[w.ball.seg]!.t1) &&
    w.bodies.every((b) => len(b.vel) < 1.5);
}

function updateFades(w: World) {
  const t = w.t;
  for (const f of w.plan.fades) {
    if (t < f.t) continue;
    const k = Math.min(1, (t - f.t) / 350);
    const b = w.bodies[f.i]!;
    if (w.swapped && (f.i === w.plan.swap?.from || f.i === w.plan.swap?.into)) continue;
    b.opacity = f.to === 1 ? Math.max(b.opacity, k) : Math.min(b.opacity, 1 - k);
  }
}

/** Ölçülü ayrıştırma: çok yakın iki görünür oyuncu birbirinden hafifçe itilir; temas hareketindekiler hariç. */
function separate(w: World, dt: number) {
  const { bodies, plan, t } = w;
  const before = bodies.map((b) => ({ ...b.pos }));
  const chk = plan.check;
  const anchored = (i: number) => i === w.ball.owner || (chk?.shooter === i && t >= chk.t - 1500 && t <= chk.t + 100);
  const contact = bodies.map((_, i) => !!activeMove(plan.moves, i, t)?.contact);
  const k = Math.min(1, dt * 8);
  const A = frame(plan.side, plan.flip);
  /** Ofsayt çizgisindeki hücumcu: savunmacıyla yalnız yana ayrışır (ileri itilip çizgiye geri çekilerek titremesin). */
  const onLine = (i: number) => plan.agents[i]!.side === plan.side && A.u(bodies[i]!.pos) > w.line - 0.04;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!;
    if (a.opacity < 0.5) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]!;
      if (b.opacity < 0.5 || (contact[i] && contact[j])) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d >= w.gap) continue;
      let nx = d > 1e-3 ? dx / d : Math.cos(i * 2.39 + j);
      let ny = d > 1e-3 ? dy / d : Math.sin(i * 2.39 + j);
      const sides = plan.agents[i]!.side !== plan.agents[j]!.side;
      if (sides && (onLine(i) || onLine(j))) {
        nx = 0;
        ny = dy >= 0 ? 1 : -1;
      }
      const push = ((w.gap - d) / 2) * k;
      // Rol hedefindeki (koşan, kaleci) oyuncu daha az itilir.
      const wa = activeMove(plan.moves, i, t) ? 0.3 : 1;
      const wb = activeMove(plan.moves, j, t) ? 0.3 : 1;
      a.pos = { x: a.pos.x - nx * push * wa, y: a.pos.y - ny * push * wa };
      b.pos = { x: b.pos.x + nx * push * wb, y: b.pos.y + ny * push * wb };
      // Şekil hedefi de kayar (kalıcı kayma olarak): itilen oyuncu aynı noktaya geri dönmeye çalışıp titremez.
      if (a.goal && !activeMove(plan.moves, i, t)) {
        a.goal = { x: a.goal.x - nx * push * wa, y: a.goal.y - ny * push * wa };
        a.off = { x: a.off.x - nx * push * wa, y: a.off.y - ny * push * wa };
      }
      if (b.goal && !activeMove(plan.moves, j, t)) {
        b.goal = { x: b.goal.x + nx * push * wb, y: b.goal.y + ny * push * wb };
        b.off = { x: b.off.x + nx * push * wb, y: b.off.y + ny * push * wb };
      }
      // Kesin sınır: noktalar asla üst üste binmez (rol hedefleri çakışsa da) — çapın altına inen çift ayrılır.
      const hard = w.gap * HARD_GAP;
      const d2 = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
      if (d2 < hard) {
        const need = hard - d2;
        // Top sahibi / vuruşa hazırlanan yerinden itilmez (top ayağından kopmasın); diğeri yol verir.
        const ha = anchored(i) ? 0 : wa;
        const hb = anchored(j) ? 0 : wb;
        const sa = ha + hb > 0 ? ha / (ha + hb) : 0.5;
        // Birbirine yaklaşma hızı kesilir (ikisi de durur gibi yaslanır, hız artmaz); kalan çakışma yürüme hızıyla açılır —
        // itme ışınlanma ya da sprintten hızlı kayma gibi görünmez.
        const closing = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
        if (closing < 0) {
          a.vel = { x: a.vel.x + nx * closing * sa, y: a.vel.y + ny * closing * sa };
          b.vel = { x: b.vel.x - nx * closing * (1 - sa), y: b.vel.y - ny * closing * (1 - sa) };
        }
        const cap = PACE.walk * dt;
        const ma = Math.min(need * sa, cap);
        const mb = Math.min(need * (1 - sa), cap);
        a.pos = { x: a.pos.x - nx * ma, y: a.pos.y - ny * ma };
        b.pos = { x: b.pos.x + nx * mb, y: b.pos.y + ny * mb };
      }
    }
  }
  // İtme kimseyi ofsayta sokmaz: çizgiyi geçen hücumcu (rol koşusu olmayan) çizgide kalır.
  if (w.line < 1) {
    bodies.forEach((b, i) => {
      if (plan.agents[i]!.side !== plan.side || plan.agents[i]!.goalkeeper || activeMove(plan.moves, i, t) || i === w.ball.owner) return;
      const u = A.u(b.pos);
      if (u > w.line && u > A.u(before[i]!)) b.pos = A.P(Math.max(w.line, A.u(before[i]!)), A.s(b.pos));
    });
  }
}

function updateBall(w: World, step: number) {
  const ball = w.ball;
  const plan = w.plan;
  const t = w.t;

  // Top geçişi (uzak yeni başlangıç): sön, yerleş, belir.
  if (ball.cut) {
    const before = ball.cut.t;
    ball.cut.t += step;
    if (before < 160 && ball.cut.t >= 160) {
      ball.pos = { ...ball.cut.to };
      ball.lift = 0;
      ball.owner = null;
    }
    ball.opacity = ball.cut.t < 160 ? 1 - ball.cut.t / 160 : Math.min(1, (ball.cut.t - 160) / 220);
    if (ball.cut.t >= 380) {
      ball.cut = null;
      ball.opacity = 1;
    }
  }
  if (t < 0) {
    if (ball.lead && w.leadIn > 0) {
      const k = Math.min(1, (t + w.leadIn) / w.leadIn);
      ball.pos = lerp(ball.lead.from, ball.lead.to, 1 - Math.pow(1 - k, 2));
    }
    ball.lift = 0;
    return;
  }
  if (ball.cut && ball.cut.t < 160) return;

  const idx = activeSeg(plan.ball, t);
  if (idx !== ball.seg) {
    ball.seg = idx;
    const s = plan.ball[idx];
    if (s?.kind === 'flight') {
      ball.from = { ...ball.pos };
      ball.owner = null;
      if (s.trail != null) w.trailFrom[s.trail] = { ...ball.from };
    } else if (s?.kind === 'loose') ball.owner = null;
  }
  const s = plan.ball[ball.seg];
  if (!s) return;
  if (s.kind === 'flight') {
    const k = Math.min(1, Math.max(0, (t - s.t0) / Math.max(1, s.t1 - s.t0)));
    ball.pos = lerp(ball.from ?? ball.pos, s.to, ease(s.style, k));
    ball.lift = s.lift * 4 * k * (1 - k);
    return;
  }
  ball.lift = 0;
  if (s.kind === 'loose') return;
  const ob = w.bodies[s.owner]!;
  if (ball.owner !== s.owner) {
    // Alıcı topa yetişince sahip olur (top ona "ışınlanmaz").
    if (dist(ob.pos, ball.pos) > 9) return;
    ball.owner = s.owner;
  }
  const sp = len(ob.vel);
  const want = sp > 3 ? { x: ob.vel.x / sp, y: ob.vel.y / sp } : s.kind === 'carry' ? unit(s.to, ob.pos, ball.facing) : ball.facing;
  ball.facing = unit(lerp(ball.facing, want, 1 - Math.exp(-step / 120)), ZERO, want);
  const gap = s.kind === 'hold' && plan.agents[s.owner]!.goalkeeper ? 2 : 5;
  const at = { x: ob.pos.x + ball.facing.x * gap, y: ob.pos.y + ball.facing.y * gap };
  // Sahiplenme anında top ayağa sıçramaz: birkaç karede yerine oturur.
  ball.pos = dist(ball.pos, at) > 1.5 ? lerp(ball.pos, at, 1 - Math.exp(-step / 90)) : at;
}

function unit(to: Vec, from: Vec, fallback: Vec): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { x: dx / d, y: dy / d } : fallback;
}

/** Planı baştan `untilMs`'e kadar adım adım işletir (hareketi azalt, testler). */
export function simulate(plan: ScenePlan, untilMs: number, prev: World | null = null, dtMs = 16): World {
  const w = createWorld(plan, prev);
  let guard = 0;
  while ((w.cut != null || w.t < untilMs) && guard++ < 20000) stepWorld(w, dtMs);
  return w;
}
