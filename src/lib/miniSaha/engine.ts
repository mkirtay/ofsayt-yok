/**
 * Mini Saha oyun motoru: saf (DOM yok), 60 Hz sabit adım. Yukarıdan bakışlı disk fiziği (oyuncu/top/direk çarpışması),
 * şut, top sürme (karakterin `control` değeri), başlama vuruşu kilidi, gol, süre + altın gol ve botlar.
 *
 * Dünya: saha çizgileri x ∈ [−HX, HX], y ∈ [−HY, HY]; 0. takım (insan) sağa (+x) hücum eder.
 * Çizim ve girdi `components/MiniSaha`'da; buradaki her şey Node'da test edilebilir (rng enjekte edilir).
 *
 * v2 (telefon geri bildirimi): saha küçültüldü + oyuncular/top büyütüldü (telefonda ~%40 daha büyük görünür); botlar
 * topu önce sürer, yalnız menzilde ve önü açıkken şut çeker, baskı altındayken önü açık takım arkadaşına mesafeye göre
 * güç ayarlı pas verir; top arkadaştayken boş alana koşar, geçildiğinde kale önüne döner.
 */
import { CHARACTERS, CHAR_IDS, type CharId, type Character } from './characters';

export const FIELD = { HX: 320, HY: 150, GH: 58, GD: 30, M: 40, BR: 11, POST: 6, CR: 62 } as const;
export const TICK_HZ = 60;

/** Oyuncu yarıçapı çarpanı (characters.ts `r` × bu): v2'de oyuncular büyüdü. */
export const PLAYER_SCALE = 1.15;

export const TUNING = {
  accel: 0.083,
  accelKicking: 0.057,
  playerDamp: 0.96,
  ballDamp: 0.982,
  kick: 4.4,
  bounce: 0.5,
  kickReach: 4,
  kickCooldown: 12,
} as const;

/** Pasın hedefe varırken kalması istenen hız (dünya birimi / tik). */
const ARRIVE_SPEED = 1.1;

/** Topla koşarken ivme çarpanı (herkes için). */
export const CARRY_SLOW = 0.88;

export type Difficulty = 'kolay' | 'orta' | 'zor';
export type Mode = '1v1' | '2v2';
export type Team = 0 | 1;

/**
 * Bot ayarları: react = kaç tikte bir karar, speed = ivme çarpanı, look = topun kaç tik ilerisine bakar, cos = şut/pas
 * için hizalama eşiği, noise = nişan sapması, shoot = şut menzili, pass = pas eğilimi (0 = hiç), recover = geçilince
 * kale önüne dönme, bank = bant (duvardan sektirme): 0 yok, 1 bantlı pas, 2 bantlı pas + şut.
 */
export const DIFFS: Record<Difficulty, { react: number; speed: number; look: number; cos: number; noise: number; shoot: number; pass: number; recover: boolean; bank: 0 | 1 | 2 }> = {
  kolay: { react: 12, speed: 0.78, look: 0, cos: 0.5, noise: 40, shoot: 200, pass: 0.35, recover: false, bank: 0 },
  orta: { react: 6, speed: 0.92, look: 6, cos: 0.72, noise: 20, shoot: 210, pass: 0.75, recover: true, bank: 1 },
  zor: { react: 3, speed: 1.0, look: 10, cos: 0.84, noise: 8, shoot: 250, pass: 1, recover: true, bank: 2 },
};

export type Input = { x: number; y: number; kick: boolean };

export type Body = { x: number; y: number; vx: number; vy: number; r: number; im: number };

export type Player = Body & {
  team: Team;
  human: boolean;
  c: Character;
  /** Bakış açısı (radyan), hareket yönüne yumuşakça döner — yalnız çizim. */
  face: number;
  ix: number;
  iy: number;
  kick: boolean;
  /** Şut gücü çarpanı (bot pasta azaltır; insan hep 1). */
  kickPow: number;
  cd: number;
  flash: number;
  // bot durumu
  think: number;
  /** Bot nişan noktası (dünya). */
  aimX: number;
  aimY: number;
  side: number;
  push: boolean;
  stuck: number;
  lbx: number;
  lby: number;
};

/** Gol olayı: `scorer` = topa son dokunan, golü atan takımdansa; kendi kalesine gol ya da belirsizse null. */
export type GameEvent = { type: 'kick'; human: boolean; player: Player } | { type: 'goal'; team: Team; scorer: Player | null } | { type: 'golden' } | { type: 'end' };

export type Phase = 'play' | 'goal' | 'end';

export type World = {
  mode: Mode;
  diff: Difficulty;
  players: Player[];
  ball: Body;
  posts: Body[];
  score: [number, number];
  /** Oynanan süre (tik); gol kutlaması sırasında durur. */
  ticks: number;
  durTicks: number;
  phase: Phase;
  /** Başlama vuruşu kilidi: topa dokunulana kadar herkes kendi yarısında, rakip orta yuvarlağın dışında. */
  lock: { team: Team } | null;
  kickoffTeam: Team;
  golden: boolean;
  goalT: number;
  rng: () => number;
  /** Son vuruşu yapan (pas sayımı için); top başka oyuncuya değince temizlenir. */
  lastKicker: Player | null;
  /** Topa son dokunan (vuruş ya da temas) — golü atanı göstermek için; fiziği etkilemez. */
  lastTouch: Player | null;
  /** Takım başına isabetli pas sayısı (vuran → aynı takımdan başka oyuncu ilk dokunuş). */
  passes: [number, number];
  /** Adımda biriken olaylar; çağıran boşaltır. */
  events: GameEvent[];
};

/** Tohumlu rastgele (test ve tekrar oynatma için). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export function makePlayer(team: Team, human: boolean, c: Character): Player {
  return {
    team, human, c, x: 0, y: 0, vx: 0, vy: 0, r: c.r * PLAYER_SCALE, im: 0.5 / c.mass, face: team === 0 ? 0 : Math.PI,
    ix: 0, iy: 0, kick: false, kickPow: 1, cd: 0, flash: 0, think: 0, aimX: 0, aimY: 0, side: 0, push: false, stuck: 0,
    lbx: NaN, lby: NaN,
  };
}

export type WorldOptions = { mode: Mode; diff: Difficulty; durSec: number; myChar: CharId; rng?: () => number };

export function createWorld(o: WorldOptions): World {
  const rng = o.rng ?? Math.random;
  const pick = () => CHARACTERS[CHAR_IDS[Math.floor(rng() * CHAR_IDS.length)]];
  const me = makePlayer(0, true, CHARACTERS[o.myChar]);
  const players =
    o.mode === '1v1' ? [me, makePlayer(1, false, pick())] : [me, makePlayer(0, false, pick()), makePlayer(1, false, pick()), makePlayer(1, false, pick())];
  const { HX, GH, POST } = FIELD;
  const w: World = {
    mode: o.mode,
    diff: o.diff,
    players,
    ball: { x: 0, y: 0, vx: 0, vy: 0, r: FIELD.BR, im: 1 },
    posts: [[-HX, -GH], [-HX, GH], [HX, -GH], [HX, GH]].map(([x, y]) => ({ x, y, vx: 0, vy: 0, r: POST, im: 0 })),
    score: [0, 0],
    ticks: 0,
    durTicks: Math.round(o.durSec * TICK_HZ),
    phase: 'play',
    lock: null,
    kickoffTeam: rng() < 0.5 ? 0 : 1,
    golden: false,
    goalT: 0,
    rng,
    lastKicker: null,
    lastTouch: null,
    passes: [0, 0],
    events: [],
  };
  resetPositions(w);
  return w;
}

/**
 * Online 1v1: iki insan oyuncu (0 = odayı kuran, camgöbeği; 1 = davet edilen, pembe). Bot yok; zorluk alanı yalnız
 * botlar için anlamlı olduğundan 'orta' kalır. Sunucu (oyun-sunucusu) bu dünyayı adımlar.
 */
export function createOnlineWorld(o: { chars: [CharId, CharId]; durSec: number; rng?: () => number }): World {
  const w = createWorld({ mode: '1v1', diff: 'orta', durSec: o.durSec, myChar: o.chars[0], rng: o.rng });
  w.players[1] = makePlayer(1, true, CHARACTERS[o.chars[1]]);
  resetPositions(w);
  return w;
}

const SPOTS: Record<number, [number, number][]> = { 1: [[-170, 0]], 2: [[-125, -55], [-225, 55]] };

export function resetPositions(w: World): void {
  const per = w.players.filter((p) => p.team === 0).length;
  const c = [0, 0];
  for (const p of w.players) {
    const s = SPOTS[per][c[p.team]++];
    p.x = p.team === 0 ? s[0] : -s[0];
    p.y = p.team === 0 ? s[1] : -s[1];
    p.vx = p.vy = 0;
    p.cd = 0;
    p.think = 0;
    p.face = p.team === 0 ? 0 : Math.PI;
  }
  w.ball.x = w.ball.y = w.ball.vx = w.ball.vy = 0;
  w.lastKicker = null;
  w.lastTouch = null;
  w.lock = { team: w.kickoffTeam };
}

// ── Bot ────────────────────────────────────────────────────────────────────
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Noktanın [a, b] doğru parçasına uzaklığı. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Top → hedef hattına en yakın rakibin uzaklığı (büyükse hat açık). */
function laneOpen(opps: Player[], bx: number, by: number, tx: number, ty: number): number {
  let m = Infinity;
  for (const o of opps) m = Math.min(m, segDist(o.x, o.y, bx, by, tx, ty) - o.r);
  return m;
}

/**
 * Bant (bilardo) nişanı: top (bx, by) → yan duvar (side: −1 üst, +1 alt) → hedef (tx, ty). Duvar çarpmada dik hızın
 * TUNING.bounce katı kalır (yansıma açısı yatıklaşır), bu yüzden düz ayna değil: sanal hedef duvarın öbür yanında
 * (W − ty) / e uzakta. İki bacağın da rakiplerden açık olup olmadığı ve toplam yol döner; duvar noktası sahada değilse null.
 */
export function bankAim(
  opps: Player[], bx: number, by: number, tx: number, ty: number, side: -1 | 1,
): { ax: number; ay: number; open: number; len: number; speed: number } | null {
  const { HX, HY, BR } = FIELD;
  const e = TUNING.bounce;
  const W = side * (HY - BR);
  const a = Math.abs(W - by);
  const b = Math.abs(W - ty);
  if (a < 12 || b < 12) return null;
  const px = bx + ((tx - bx) * a) / (a + b / e);
  if (Math.abs(px) > HX - 24) return null;
  const open = Math.min(laneOpen(opps, bx, by, px, W), laneOpen(opps, px, W, tx, ty));
  const l1 = Math.hypot(px - bx, W - by);
  const l2 = Math.hypot(tx - px, ty - W);
  // gereken çıkış hızı: sürtünmede hız yol başına (1 − ballDamp) azalır; duvarda dik bileşen e katına iner
  const k = 1 - TUNING.ballDamp;
  const sin = a / l1; // gidiş yönünün duvara dik bileşeni
  const keep = Math.sqrt(1 - sin * sin + e * e * sin * sin);
  const speed = k * l1 + (ARRIVE_SPEED + k * l2) / keep;
  return { ax: tx, ay: W + side * (b / e), open, len: l1 + l2, speed };
}

/** Düz pas/şut için gereken çıkış hızı (hedefe ARRIVE_SPEED ile varsın). */
export function straightSpeed(len: number): number {
  return ARRIVE_SPEED + (1 - TUNING.ballDamp) * len;
}

/** Topa sahip olan (topa değecek kadar yakın en yakın oyuncu) ya da null. */
function carrierOf(w: World): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of w.players) {
    const d = dist(p, w.ball);
    if (d < bd) { bd = d; best = p; }
  }
  return best && bd < best.r + w.ball.r + 10 ? best : null;
}

/** Topa doğru: hedef yöne (gx, gy) itmek için topun arkasına geç; hizalıysa içinden geç. Hedef nokta döner. */
function approach(p: Player, bx: number, by: number, gx: number, gy: number, R: number): { tx: number; ty: number; aligned: number } {
  const rel = (p.x - bx) * gx + (p.y - by) * gy; // >0: topun önündeyim (yanlış taraf)
  // dolanma ↔ itme geçişi histerezisli (eşikte salınmasın)
  if (p.push) {
    if (rel > R * 0.35) p.push = false;
  } else if (rel < -R * 0.4) p.push = true;
  const d = Math.hypot(bx - p.x, by - p.y) || 1;
  const aligned = ((bx - p.x) / d) * gx + ((by - p.y) / d) * gy;
  if (!p.push) {
    const px = -gy;
    const py = gx;
    const lat = (p.x - bx) * px + (p.y - by) * py;
    if (!p.side || Math.abs(lat) > R) p.side = lat >= 0 ? 1 : -1;
    return { tx: bx - gx * (R + 14) + px * p.side * (R + 16), ty: by - gy * (R + 14) + py * p.side * (R + 16), aligned };
  }
  p.side = 0;
  return { tx: bx + gx * 30, ty: by + gy * 30, aligned };
}

/**
 * Topa değmeden topla kendi kalesi arasındaki noktaya (`gap` uzaklıkta) giden hedef: düz yol topa sürtüyorsa önce
 * topun yanına (bulunduğu taraftan) açılır. Gövdeyle topu kendi kalesine itmemek için (savunmaya dönüş, kurtarma).
 */
function goalSideDetour(p: Player, bx: number, by: number, ownX: number, gap: number): { tx: number; ty: number } {
  const R = gap - 16;
  let vx = ownX - bx;
  let vy = -by * 0.5;
  const vl = Math.hypot(vx, vy) || 1;
  vx /= vl;
  vy /= vl;
  const gsx = bx + vx * gap;
  const gsy = by + vy * gap;
  if (segDist(bx, by, p.x, p.y, gsx, gsy) < R + 6) {
    const px = -vy;
    const py = vx;
    const side = (p.x - bx) * px + (p.y - by) * py >= 0 ? 1 : -1;
    return { tx: bx + px * side * (R + 26) + vx * 6, ty: by + py * side * (R + 26) + vy * 6 };
  }
  return { tx: gsx, ty: gsy };
}

/**
 * Oyuncu şimdi vurursa top (vuruş yönü = oyuncudan topa) kendi kalesinin ağzına (kenar payıyla) doğru mu gider?
 * Engine'deki vuruş topa bu yönde hız ekler; mevcut top hızı da hesaba katılır.
 */
export function ownGoalShot(p: Player, ball: Body): boolean {
  const { HX, GH } = FIELD;
  const ownX = p.team === 0 ? -HX : HX;
  const d = Math.hypot(ball.x - p.x, ball.y - p.y) || 1;
  const K = TUNING.kick * p.c.kick * p.kickPow;
  const vx = ball.vx + ((ball.x - p.x) / d) * K;
  const vy = ball.vy + ((ball.y - p.y) / d) * K;
  if (vx * (ownX - ball.x) <= 0) return false; // kendi kale çizgisine doğru gitmiyor
  const t = (ownX - ball.x) / vx;
  return Math.abs(ball.y + vy * t) < GH + 30;
}

function botThink(w: World, p: Player): void {
  const D = DIFFS[w.diff];
  const { HX, HY, GH } = FIELD;
  const ball = w.ball;
  const dir = p.team === 0 ? 1 : -1;
  const ownX = -dir * HX;
  const goalX = dir * HX;
  const bx = ball.x + ball.vx * D.look;
  const by = ball.y + ball.vy * D.look;
  const R = p.r + ball.r;
  const mates = w.players.filter((q) => q !== p && q.team === p.team);
  const opps = w.players.filter((q) => q.team !== p.team);
  const myD = dist(p, ball);
  const carrier = carrierOf(w);
  const closestOnTeam = !mates.some((q) => dist(q, ball) < myD - 6);
  let tx: number;
  let ty: number;
  let kick = false;
  p.kickPow = 1;

  if (w.lock && w.lock.team !== p.team) {
    // rakibin başlama vuruşu: kendi yarısında bekle
    tx = ownX * 0.35;
    ty = by * 0.3;
  } else if (!closestOnTeam) {
    if (carrier && carrier.team === p.team) {
      // arkadaşta top: önde, topun öbür kanadında boş alana koş (pas al)
      tx = Math.max(-HX + 40, Math.min(HX - 50, bx + dir * 110));
      ty = by > 0 ? -HY * 0.4 : HY * 0.4;
      // rakibin dibindeysen biraz aç
      for (const o of opps) if (dist(o, { x: tx, y: ty }) < 40) ty += ty > 0 ? -45 : 45;
    } else {
      // top rakipte / boşta: topla kendi kalesi arasında, topa daha yakın dur
      tx = ownX + (bx - ownX) * 0.45;
      ty = by * 0.55;
      // yerine koşarken topun içinden geçecekse (top kalemize yakın ve ben yanlış taraftaysam) dolan
      if (dir * (bx - ownX) < HX * 0.6 && dir * (p.x - bx) > -R * 0.3 && segDist(ball.x, ball.y, p.x, p.y, tx, ty) < R + 6) {
        ({ tx, ty } = goalSideDetour(p, bx, by, ownX, R + 30));
      }
    }
  } else {
    // ── topa en yakın benim ──
    const beaten = dir * (p.x - bx) > R * 0.5 && carrier !== null && carrier.team !== p.team;
    // kendi kalesine yakın tehlike bölgesi: top kendi kale çizgisinden sahanın ~%30'u kadar içeride
    const danger = dir * (bx - ownX) < HX * 0.6;
    // topla kendi kalesi arasında değilim (top benimle kalem arasında ya da yanımda)
    const wrongSide = dir * (p.x - bx) > -R * 0.3;
    if (danger && wrongSide) {
      // HER zorlukta: topa DEĞMEDEN geniş yaydan kale tarafına geç (gövdeyle topu kendi kaleme itmeyeyim)
      ({ tx, ty } = goalSideDetour(p, bx, by, ownX, R + 16));
      p.push = false;
    } else if (beaten && D.recover) {
      // geçildim: dolaşmak yerine doğrudan topla kale arasına dön
      const ox = ownX - bx;
      const oy = -by;
      const ol = Math.hypot(ox, oy) || 1;
      tx = bx + (ox / ol) * (R + 22);
      ty = by + (oy / ol) * (R + 22);
      p.push = false;
    } else {
      // karar: şut / pas / sür / uzaklaştır (yalnız karar tikinde yeniden seçilir)
      const toGoal = Math.hypot(goalX - bx, by);
      const nearOpp = opps.reduce((m, o) => Math.min(m, dist(o, ball)), Infinity);
      let mode: 'shoot' | 'pass' | 'dribble' | 'clear' = 'dribble';
      /** Bantlı vuruş: daha hassas hizalanmadan vurulmaz. */
      let banked = false;
      let ax = goalX;
      let ay = 0;
      if (toGoal < D.shoot) {
        // en açık köşe: üç hedeften rakiplere en uzak hat
        let best = -Infinity;
        for (const cy of [-GH + 14, 0, GH - 14]) {
          const open = laneOpen(opps, bx, by, goalX, cy) + (w.rng() - 0.5) * D.noise;
          if (open > best) { best = open; ay = cy; }
        }
        ax = goalX;
        mode = best > 6 || toGoal < D.shoot * 0.6 ? 'shoot' : 'dribble';
        if (mode !== 'shoot' && D.bank >= 2) {
          // önü kapalı: yan duvardan kaleye bant
          for (const side of [-1, 1] as const) {
            const bk = bankAim(opps, bx, by, goalX, side * (GH - 18), side);
            if (bk && bk.open > 10 && bk.speed <= TUNING.kick * p.c.kick * 0.9) {
              mode = 'shoot';
              ax = bk.ax;
              ay = bk.ay;
              banked = true;
              break;
            }
          }
        }
      }
      if (mode !== 'shoot' && mates.length && w.rng() < D.pass) {
        // pas: baskı altındaysam ya da arkadaş daha iyi yerdeyse, hattı açık arkadaşa
        for (const m of mates) {
          const lx = m.x + m.vx * 12;
          const ly = m.y + m.vy * 12;
          const ahead = dir * (lx - bx) > -30;
          const better = Math.hypot(goalX - lx, ly) < toGoal - 60;
          // kendi kalemize yakınken de (uzaklaştırmak yerine) önü açık arkadaşa pasla oyun kur
          if (!ahead || !(nearOpp < 70 || better || danger) || dist(m, ball) < 60) continue;
          if (laneOpen(opps, bx, by, lx, ly) > 18) {
            mode = 'pass';
            ax = lx;
            ay = ly;
            p.kickPow = Math.max(0.4, Math.min(1, straightSpeed(Math.hypot(lx - bx, ly - by)) / (TUNING.kick * p.c.kick)));
            break;
          }
          if (D.bank >= 1) {
            // düz hat kapalı: arkadaşa yan duvardan bant pası (açık bacaklı, daha kısa yolu seç)
            let pick: ReturnType<typeof bankAim> = null;
            for (const side of [-1, 1] as const) {
              const bk = bankAim(opps, bx, by, lx, ly, side);
              // ulaşabileceği bantlar (gereken hız vuruş gücünü aşmasın)
              if (bk && bk.open > 18 && bk.speed <= TUNING.kick * p.c.kick && (!pick || bk.len < pick.len)) pick = bk;
            }
            if (pick) {
              mode = 'pass';
              ax = pick.ax;
              ay = pick.ay;
              banked = true;
              p.kickPow = Math.max(0.4, Math.min(1, pick.speed / (TUNING.kick * p.c.kick)));
              break;
            }
          }
        }
      }
      if (mode === 'dribble') {
        // kendi kalesine yakın ve baskı varsa uzaklaştır; yoksa kaleye doğru sür, öndeki rakibin yanından geç
        if (danger) {
          // defans gibi uzaklaştır: ileriye ve yakın çizgiye doğru (ortadan, kale önünden değil)
          mode = 'clear';
          ax = bx + dir * 160;
          ay = (by >= 0 ? 1 : -1) * HY;
        } else {
          ax = goalX;
          ay = p.aimY;
          for (const o of opps) {
            const ahead = dir * (o.x - bx);
            if (ahead > 0 && ahead < 70 && Math.abs(o.y - by) < 36) ay = by + (o.y > by ? -70 : 70);
          }
        }
      }
      if (p.think <= 0 && w.rng() < 0.2) p.aimY = (w.rng() * 2 - 1) * (GH - 18);
      // köşe / kale çizgisi dibi: önce ceza sahası ortasına çek
      if (mode !== 'pass' && dir * bx > HX - 55 && Math.abs(by) > GH - 6) { ax = dir * (HX - 90); ay = 0; mode = 'clear'; }
      let gx = ax - bx;
      let gy = ay - by;
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl;
      gy /= gl;
      const a = approach(p, bx, by, gx, gy, R);
      tx = a.tx;
      ty = a.ty;
      const needCos = banked ? Math.max(D.cos, 0.96) : mode === 'clear' ? Math.min(D.cos, 0.6) : D.cos;
      if (mode !== 'dribble' && p.push && myD < R + 6 && a.aligned > needCos) kick = true;
    }
    // sıkışma: top ~2,5 sn boyunca aynı küçük alanda kaldıysa (kıpırdasa bile) kurtarma hareketi
    if (Number.isFinite(p.lbx) && Math.hypot(ball.x - p.lbx, ball.y - p.lby) < 24) p.stuck += D.react;
    else {
      p.stuck = 0;
      p.lbx = ball.x;
      p.lby = ball.y;
    }
    if (p.stuck > 150 && dir * (ball.x - ownX) < HX * 0.6) {
      // kendi kalemize yakın sıkışma: kale tarafına dolan, oradan (korumalı) uzaklaştır
      if (dir * (p.x - ball.x) > -R * 0.3) ({ tx, ty } = goalSideDetour(p, ball.x, ball.y, ownX, R + 16));
      else { tx = ball.x + dir * 30; ty = ball.y + (ball.y >= 0 ? 20 : -20); kick = true; }
      if (p.stuck > 260) p.stuck = 0;
    } else if (p.stuck > 150) {
      // saha ortası tarafından topa gir ve vur: top kenara/köşeye sıkıştıysa (iri oyuncu arkasına sığmıyorsa) duvardan
      // sekip kurtulur; doğrudan oyuncudan topa gitmek direğe takılabiliyordu
      const cl = Math.hypot(ball.x, ball.y) || 1;
      tx = ball.x + (ball.x / cl) * 24;
      ty = ball.y + (ball.y / cl) * 24;
      if (dist(p, ball) > R + 4 && ((p.x - ball.x) * ball.x + (p.y - ball.y) * ball.y) / cl > -R * 0.5) {
        // önce topun saha tarafına geç
        tx = ball.x - (ball.x / cl) * (R + 6);
        ty = ball.y - (ball.y / cl) * (R + 6);
      }
      kick = true;
      if (p.stuck > 260) p.stuck = 0;
    }
  }
  // kendi kalesine vuruş koruması (her zorlukta): vuruş yönü kendi kale ağzına çıkıyorsa vurma
  if (kick && ownGoalShot(p, ball)) kick = false;
  // gövde koruması (her zorlukta): topa değmek üzereyken temas topu kendi kale ağzına itecekse kale tarafına dolan
  {
    const ownX2 = -dir * HX;
    const d = dist(p, ball);
    const mvx = tx - p.x;
    const mvy = ty - p.y;
    if (d < R + 14 && mvx * (ball.x - p.x) + mvy * (ball.y - p.y) > 0 && dir * (ball.x - ownX2) < HX * 0.75) {
      const nx = (ball.x - p.x) / (d || 1);
      const ny = (ball.y - p.y) / (d || 1);
      if (nx * (ownX2 - ball.x) > 0) {
        const t = (ownX2 - ball.x) / nx;
        if (Math.abs(ball.y + ny * t) < GH + 30) {
          ({ tx, ty } = goalSideDetour(p, ball.x, ball.y, ownX2, R + 16));
          kick = false;
        }
      }
    }
  }

  // direkten kaçınma: hedefe giden yol bir direğe sürtüyorsa önce direğin saha tarafındaki ara noktaya git
  // (kale çizgisinde direğin arkasında kalıp düz çizgide direğe yüklenerek sıkışmasın)
  for (const q of w.posts) {
    if (dist(p, q) < 90 && segDist(q.x, q.y, p.x, p.y, tx, ty) < p.r + q.r + 2) {
      const wx = q.x - Math.sign(q.x) * (p.r + q.r + 12);
      // ara noktaya vardıysa asıl hedefe devam (ara noktada takılı kalmasın)
      if (Math.hypot(p.x - wx, p.y - q.y) > 8) { tx = wx; ty = q.y; }
      break;
    }
  }
  const mx = tx - p.x;
  const my = ty - p.y;
  const ml = Math.hypot(mx, my);
  const s = ml < 8 ? ml / 8 : 1;
  p.ix = ml ? (mx / ml) * s : 0;
  p.iy = ml ? (my / ml) * s : 0;
  p.kick = kick;
}

// ── Fizik ──────────────────────────────────────────────────────────────────
function collide(a: Body, b: Body, e: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const R = a.r + b.r;
  if (d >= R || d === 0) return;
  const sum = a.im + b.im;
  if (!sum) return;
  const nx = dx / d;
  const ny = dy / d;
  const pen = R - d;
  a.x -= (nx * pen * a.im) / sum;
  a.y -= (ny * pen * a.im) / sum;
  b.x += (nx * pen * b.im) / sum;
  b.y += (ny * pen * b.im) / sum;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = (-(1 + e) * rv) / sum;
    a.vx -= j * nx * a.im;
    a.vy -= j * ny * a.im;
    b.vx += j * nx * b.im;
    b.vy += j * ny * b.im;
  }
}

function ballWalls(b: Body): void {
  const { HX, HY, GH, GD } = FIELD;
  const e = TUNING.bounce;
  const r = b.r;
  if (Math.abs(b.x) > HX) {
    // kalenin içi: yan ağlar + arka ağ
    if (b.y - r < -GH) { b.y = -GH + r; b.vy = Math.abs(b.vy) * e; }
    if (b.y + r > GH) { b.y = GH - r; b.vy = -Math.abs(b.vy) * e; }
    const back = HX + GD;
    if (Math.abs(b.x) + r > back) { const s = Math.sign(b.x); b.x = s * (back - r); b.vx = -s * Math.abs(b.vx) * 0.25; }
  } else {
    if (b.y - r < -HY) { b.y = -HY + r; b.vy = Math.abs(b.vy) * e; }
    if (b.y + r > HY) { b.y = HY - r; b.vy = -Math.abs(b.vy) * e; }
    if (Math.abs(b.x) + r > HX && Math.abs(b.y) >= GH) { const s = Math.sign(b.x); b.x = s * (HX - r); b.vx = -s * Math.abs(b.vx) * e; }
  }
}

/**
 * Bir tik ilerletir. `human`: insan oyuncunun girdisi (x, y ∈ [−1, 1], dünya yönünde). `perPlayer` verilirse insan
 * oyuncular girdisini oradan (oyuncu sırasına göre) alır — online maçta iki insan için.
 */
export function stepWorld(w: World, human: Input, perPlayer?: readonly (Input | undefined)[]): void {
  if (w.phase === 'end') return;
  const D = DIFFS[w.diff];
  const { HX, HY, M, CR, GH } = FIELD;
  const ball = w.ball;

  for (let pi = 0; pi < w.players.length; pi++) {
    const p = w.players[pi];
    if (p.human) {
      const inp = perPlayer?.[pi] ?? human;
      p.ix = inp.x; p.iy = inp.y; p.kick = inp.kick; p.kickPow = 1;
    }
    else if (--p.think <= 0) { botThink(w, p); p.think = D.react; }
    let ax = p.ix;
    let ay = p.iy;
    const l = Math.hypot(ax, ay);
    if (l > 1) { ax /= l; ay /= l; }
    // topla koşan (top ayağına değiyor, şut tuşu basılı değil) biraz yavaşlar: top sürmek bedelsiz olmasın
    const carrying = !p.kick && dist(p, ball) <= p.r + ball.r + 2.5;
    const a = (p.kick ? TUNING.accelKicking : TUNING.accel) * (carrying ? CARRY_SLOW : 1) * p.c.speed * (p.human ? 1 : D.speed);
    p.vx = (p.vx + ax * a) * TUNING.playerDamp;
    p.vy = (p.vy + ay * a) * TUNING.playerDamp;
    p.x += p.vx;
    p.y += p.vy;
    if (p.cd > 0) p.cd--;
    if (p.flash > 0) p.flash--;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0.25) {
      let dA = Math.atan2(p.vy, p.vx) - p.face;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      p.face += dA * 0.25;
    }
  }
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= TUNING.ballDamp;
  ball.vy *= TUNING.ballDamp;

  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      for (let j = i + 1; j < w.players.length; j++) collide(p, w.players[j], 0.5);
      // kontrolü yüksek karakterde top ayaktan daha az seker
      collide(p, ball, 0.5 * (1 - p.c.control * 0.7));
      for (const q of w.posts) collide(q, p, 0.4);
    }
    for (const q of w.posts) collide(q, ball, 0.6);
  }

  // son dokunan (gol sahibi için)
  for (const p of w.players) if (dist(p, ball) <= p.r + ball.r + 1.5) w.lastTouch = p;

  // pas sayımı: son vuranın ardından topa ilk değen
  if (w.lastKicker) {
    for (const p of w.players) {
      if (p === w.lastKicker || dist(p, ball) > p.r + ball.r + 1.5) continue;
      if (p.team === w.lastKicker.team) w.passes[p.team]++;
      w.lastKicker = null;
      break;
    }
  }

  // top sürme: şut tuşu basılı değilken top temas halindeyse oyuncunun hızına ve önüne çekilir
  for (const p of w.players) {
    if (p.kick || p.c.control <= 0) continue;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    if (Math.hypot(dx, dy) > p.r + ball.r + 2.5) continue;
    const k = p.c.control * 0.16;
    ball.vx += (p.vx - ball.vx) * k;
    ball.vy += (p.vy - ball.vy) * k;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0.3) {
      const fx = p.x + (p.vx / sp) * (p.r + ball.r + 0.5);
      const fy = p.y + (p.vy / sp) * (p.r + ball.r + 0.5);
      const m = p.c.control * 0.06;
      ball.x += (fx - ball.x) * m;
      ball.y += (fy - ball.y) * m;
    }
  }

  // şut: tuş basılıyken topa yeterince yakınsa vurur
  for (const p of w.players) {
    if (!p.kick || p.cd > 0) continue;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < p.r + ball.r + TUNING.kickReach) {
      const K = TUNING.kick * p.c.kick * p.kickPow;
      ball.vx += (dx / d) * K;
      ball.vy += (dy / d) * K;
      p.cd = TUNING.kickCooldown;
      p.flash = 8;
      w.lastKicker = p;
      w.lastTouch = p;
      w.events.push({ type: 'kick', human: p.human, player: p });
    }
  }

  ballWalls(ball);
  const limX = HX + M;
  const limY = HY + M;
  for (const p of w.players) {
    p.x = Math.max(-limX + p.r, Math.min(limX - p.r, p.x));
    p.y = Math.max(-limY + p.r, Math.min(limY - p.r, p.y));
    // kale ağının içine girilmez (direkle saha sınırı arasında sıkışmasın): ağız hizasında en fazla çizginin üstü
    if (Math.abs(p.x) > HX && Math.abs(p.y) < GH) {
      p.x = Math.sign(p.x) * HX;
      p.vx = 0;
    }
    if (w.lock) {
      if (p.team === 0 && p.x > -p.r * 0.2) { p.x = -p.r * 0.2; p.vx = Math.min(p.vx, 0); }
      if (p.team === 1 && p.x < p.r * 0.2) { p.x = p.r * 0.2; p.vx = Math.max(p.vx, 0); }
      if (p.team !== w.lock.team) {
        const d = Math.hypot(p.x, p.y);
        const min = CR + p.r;
        if (d < min) {
          if (d) { p.x *= min / d; p.y *= min / d; } else p.x = p.team === 0 ? -min : min;
        }
      }
    }
  }
  if (w.lock && Math.hypot(ball.vx, ball.vy) > 0.05) w.lock = null;

  if (w.phase === 'play') {
    if (Math.abs(ball.x) > HX + ball.r && Math.abs(ball.y) < GH) {
      const team: Team = ball.x > 0 ? 0 : 1;
      w.score[team]++;
      w.kickoffTeam = team === 0 ? 1 : 0;
      w.phase = 'goal';
      w.goalT = 100;
      w.lastKicker = null;
      const scorer = w.lastTouch && w.lastTouch.team === team ? w.lastTouch : null;
      w.events.push({ type: 'goal', team, scorer });
      return;
    }
    w.ticks++;
    if (w.ticks >= w.durTicks && !w.golden) {
      if (w.score[0] === w.score[1]) {
        w.golden = true;
        w.events.push({ type: 'golden' });
      } else endMatch(w);
    }
  } else if (w.phase === 'goal' && --w.goalT <= 0) {
    if (w.golden) endMatch(w);
    else { resetPositions(w); w.phase = 'play'; }
  }
}

function endMatch(w: World): void {
  w.phase = 'end';
  w.events.push({ type: 'end' });
}

/** Kalan süre (sn, yukarı yuvarlanmış); altın golde 0. */
export function secondsLeft(w: World): number {
  return Math.max(0, Math.ceil((w.durTicks - w.ticks) / TICK_HZ));
}
