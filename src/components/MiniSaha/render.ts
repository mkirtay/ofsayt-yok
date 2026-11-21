/**
 * Mini Saha çizimi (Canvas 2D). Saha her zaman YATAY; sahanın etrafındaki boşluk tribün + reklam panosuyla dolar.
 * Tribün pahalı (yüzlerce taraftar) → boyut değişince bir kez ekran dışı tuvale çizilir, her karede kopyalanır.
 * Oyuncular yukarıdan bakışla: omuzlar + baş + karakterin saçı / bandı / sakalı (characters.ts `look`).
 */
import { FIELD, type Body, type Player, type World } from '@/lib/miniSaha/engine';
import type { CharId, Character } from '@/lib/miniSaha/characters';

/** Hazır (çözülmüş) saha jeton görselleri; olmayan karakter kodla çizilir. */
export type TokenImages = Partial<Record<CharId, HTMLImageElement>>;

export const KIT = { 0: '#06d0f9', 1: '#eb47b4' } as const;
const KIT_DARK = { 0: '#0596b3', 1: '#a8307f' } as const;
const NIGHT = '#0f1015';

export type View = { w: number; h: number; dpr: number; s: number; cx: number; cy: number };

/** Sahayı (çizgiler + M payı) tuvale sığdırır; üstte skor şeridi sahanın dış payına biner. */
export function fitView(w: number, h: number, dpr: number): View {
  const ew = 2 * (FIELD.HX + FIELD.M);
  const eh = 2 * (FIELD.HY + FIELD.M);
  const pad = 6 * dpr;
  // üstte ve altta her ekranda en az birkaç sıra tribün görünsün (telefonda saha yüksekliği doldurmasın)
  const stand = Math.min(64 * dpr, Math.max(18 * dpr, h * 0.08));
  const s = Math.min((w - 2 * pad) / ew, (h - 2 * stand) / eh);
  return { w, h, dpr, s, cx: w / 2, cy: h / 2 };
}

/** Tohumlu rastgele (tribünün her açılışta aynı görünmesi için). */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const SKINS = ['#f0c4a4', '#e2b48c', '#c98d5f', '#a8714a', '#7a4a2e', '#5a3622'];
const NEUTRAL = ['#2c2f3b', '#3a3e4b', '#4a4f5e', '#20232c', '#5b6070', '#c4c8d2'];
const TEAM_SHIRT = { 0: ['#06d0f9', '#05a9cb', '#7be6fc'], 1: ['#eb47b4', '#c2358f', '#f59ad5'] } as const;
/** Tribün en fazla bu kadar basamak (dışı karanlık stadyum). */
const STAND_ROWS = 9;

/**
 * Tribün + pano katmanı (ekran pikseli, boyut değişince bir kez çizilir). Sahanın çevresinde basamak halkaları;
 * basamaklarda yukarıdan bakışla taraftarlar (omuz + baş): sol yarı camgöbeği, sağ yarı pembe ağırlıklı, aralarda nötr
 * ve boş koltuklar; birkaç pankart, köşelerde projektör ışığı, sahaya bakan LED panolar.
 */
export function buildStands(v: View): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = v.w;
  c.height = v.h;
  const g = c.getContext('2d')!;
  // birim: saha ölçeğine bağlı (büyük ekranda taraftar / pano da oyuncularla orantılı büyür)
  const u = Math.max(v.dpr * 0.8, v.s * 0.9);
  // zemin: dışa doğru kararan stadyum
  const bg = g.createRadialGradient(v.cx, v.cy, Math.min(v.w, v.h) * 0.3, v.cx, v.cy, Math.max(v.w, v.h) * 0.75);
  bg.addColorStop(0, '#171920');
  bg.addColorStop(1, '#07080b');
  g.fillStyle = bg;
  g.fillRect(0, 0, v.w, v.h);
  // sahanın dış sınırı (M payı dahil) ekran koordinatında
  const ox = (FIELD.HX + FIELD.M) * v.s;
  const oy = (FIELD.HY + FIELD.M) * v.s;
  const L = v.cx - ox;
  const T = v.cy - oy;
  const Rr = v.cx + ox;
  const B = v.cy + oy;
  const board = 11 * u;
  const step = 13 * u;
  const rnd = rand(20261121);

  const fan = (x: number, y: number, team: 0 | 1, fade: number) => {
    if (rnd() < 0.14) {
      // boş koltuk
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(x - 2 * u, y - 1.5 * u, 4 * u, 3 * u);
      return;
    }
    const jx = (rnd() - 0.5) * 2 * u;
    const jy = (rnd() - 0.5) * 1.6 * u;
    const shirt = rnd() < 0.6 ? TEAM_SHIRT[team][Math.floor(rnd() * 3)] : NEUTRAL[Math.floor(rnd() * NEUTRAL.length)];
    g.globalAlpha = fade;
    g.fillStyle = shirt;
    g.beginPath(); g.ellipse(x + jx, y + jy + 0.8 * u, 3.4 * u, 2.3 * u, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = SKINS[Math.floor(rnd() * SKINS.length)];
    g.beginPath(); g.arc(x + jx, y + jy - 0.4 * u, 1.9 * u, 0, Math.PI * 2); g.fill();
    if (rnd() < 0.07) {
      // atkı açan taraftar: başın iki yanında takım renginde kol/atkı
      g.fillStyle = TEAM_SHIRT[team][0];
      g.fillRect(x + jx - 4.2 * u, y + jy - 2.6 * u, 8.4 * u, 1.3 * u);
    }
    g.globalAlpha = 1;
  };

  for (let i = 0, d = board; i < STAND_ROWS; i++, d += step) {
    if (L - d < -step && T - d < -step) break;
    // basamak bandı + ön kenar ışığı
    g.fillStyle = i % 2 ? '#181a21' : '#1c1f27';
    g.fillRect(L - d - step, T - d - step, Rr - L + 2 * (d + step), step);
    g.fillRect(L - d - step, B + d, Rr - L + 2 * (d + step), step);
    g.fillRect(L - d - step, T - d, step, B - T + 2 * d);
    g.fillRect(Rr + d, T - d, step, B - T + 2 * d);
    g.fillStyle = 'rgba(255,255,255,.035)';
    g.fillRect(L - d - step, T - d - 1 * u, Rr - L + 2 * (d + step), 1 * u);
    g.fillRect(L - d - step, B + d + step - 1 * u, Rr - L + 2 * (d + step), 1 * u);
    const fade = Math.max(0.35, 0.95 - i * 0.07);
    const gap = 9 * u;
    for (let x = L - d - step / 2; x < Rr + d + step; x += gap) {
      const team = x < v.cx ? 0 : 1;
      fan(x, T - d - step / 2, team, fade);
      fan(x, B + d + step / 2, team, fade);
    }
    for (let y = T - d + gap / 2; y < B + d; y += gap) {
      fan(L - d - step / 2, y, 0, fade);
      fan(Rr + d + step / 2, y, 1, fade);
    }
  }

  // pankartlar (üst tribün, sahaya yakın sıralarda)
  const banner = (x: number, w: number, color: string, text: string) => {
    const y = T - board - step * 2.6;
    if (y < 0) return;
    g.fillStyle = color;
    g.fillRect(x, y, w, step * 1.6);
    g.fillStyle = '#0f1015';
    g.font = `800 ${Math.round(step * 0.95)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + step * 0.82);
  };
  const bw = Math.min(150 * u, (Rr - L) * 0.18);
  banner(L + (Rr - L) * 0.16, bw, '#06d0f9', 'SCOR3');
  banner(Rr - (Rr - L) * 0.16 - bw, bw, '#eb47b4', 'MİNİ SAHA');
  g.textAlign = 'start';

  // projektörler: köşelerde ışık halesi + lamba
  for (const [px, py] of [[L - board * 2, T - board * 2], [Rr + board * 2, T - board * 2], [L - board * 2, B + board * 2], [Rr + board * 2, B + board * 2]]) {
    const glow = g.createRadialGradient(px, py, 0, px, py, 120 * u);
    glow.addColorStop(0, 'rgba(255,255,240,.22)');
    glow.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = glow;
    g.fillRect(px - 120 * u, py - 120 * u, 240 * u, 240 * u);
    g.fillStyle = '#f4f6f9';
    g.fillRect(px - 7 * u, py - 3 * u, 14 * u, 6 * u);
  }

  // LED reklam panoları (sahanın hemen dışı)
  g.fillStyle = '#0b0c10';
  g.fillRect(L - board, T - board, Rr - L + 2 * board, board);
  g.fillRect(L - board, B, Rr - L + 2 * board, board);
  g.fillRect(L - board, T, board, B - T);
  g.fillRect(Rr, T, board, B - T);
  g.fillStyle = 'rgba(0,167,111,.55)';
  g.fillRect(L - board, T - 1 * u, Rr - L + 2 * board, 1 * u);
  g.fillRect(L - board, B, Rr - L + 2 * board, 1 * u);
  g.font = `800 ${Math.round(7.5 * u)}px Inter, system-ui, sans-serif`;
  g.textBaseline = 'middle';
  const words = ['SCOR3', 'getscor3.com', 'MİNİ SAHA'];
  let k = 0;
  for (let x = L + 10 * u; x < Rr - 40 * u; x += 90 * u, k++) {
    g.fillStyle = k % 3 === 1 ? '#f2f3f5' : '#c6ff3a';
    g.fillText(words[k % 3], x, T - board / 2);
    g.fillText(words[(k + 1) % 3], x, B + board / 2);
  }
  return c;
}

function pitch(g: CanvasRenderingContext2D, lockTeam: 0 | 1 | null): void {
  const { HX, HY, GH, GD, M, CR } = FIELD;
  const ox = HX + M;
  const oy = HY + M;
  g.fillStyle = '#1b6a43';
  g.fillRect(-ox, -oy, ox * 2, oy * 2);
  g.fillStyle = '#1f7449';
  for (let x = -ox, i = 0; x < ox; x += 58, i++) if (i % 2 === 0) g.fillRect(x, -oy, 58, oy * 2);
  // kale ağları
  for (const sg of [-1, 1]) {
    const x0 = sg > 0 ? HX : -HX - GD;
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.fillRect(x0, -GH, GD, GH * 2);
    g.strokeStyle = 'rgba(255,255,255,.2)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = -GH + 8; y < GH; y += 8) { g.moveTo(x0, y); g.lineTo(x0 + GD, y); }
    for (let x = x0 + 8; x < x0 + GD; x += 8) { g.moveTo(x, -GH); g.lineTo(x, GH); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(sg * HX, -GH); g.lineTo(sg * (HX + GD), -GH); g.lineTo(sg * (HX + GD), GH); g.lineTo(sg * HX, GH);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = 2.5;
  g.strokeRect(-HX, -HY, HX * 2, HY * 2);
  g.beginPath(); g.moveTo(0, -HY); g.lineTo(0, HY); g.stroke();
  if (lockTeam !== null) {
    g.fillStyle = lockTeam === 0 ? 'rgba(6,208,249,.16)' : 'rgba(235,71,180,.16)';
    g.beginPath(); g.arc(0, 0, CR, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.arc(0, 0, CR, 0, Math.PI * 2); g.stroke();
  for (const sg of [-1, 1]) {
    g.strokeRect(sg > 0 ? HX - 72 : -HX, -110, 72, 220);
    g.strokeRect(sg > 0 ? HX - 28 : -HX, -GH - 10, 28, (GH + 10) * 2);
    g.beginPath(); g.arc(sg * (HX - 52), 0, 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
  }
  g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
  // köşe yayları
  // [x işareti, y işareti, sahaya bakan çeyrek yayın başlangıç açısı]
  const corners: [number, number, number][] = [[-1, -1, 0], [1, -1, 0.5], [1, 1, 1], [-1, 1, 1.5]];
  for (const [sx, sy, a] of corners) {
    g.beginPath();
    g.arc(sx * HX, sy * HY, 9, a * Math.PI, (a + 0.5) * Math.PI);
    g.stroke();
  }
}

/**
 * Oyuncu simgesi, yerel çerçevede (+x = baktığı yön; yukarıdan bakış): omuzlar (forma, karaktere göre genişlik), eller,
 * baş ve portreyle eşleşen ayrıntılar — saç / bant / ibik / atkuyruğu / sakal, pazubent / bileklik
 * (docs/MINI_SAHA_GORSEL_PROMPTLARI.md). Forma numarası bu ölçekte okunmadığı için çizilmez (seçim ekranında var).
 * Çizim yarıçap `r` içinde kalır; çarpışma alanı değişmez. Menüdeki yedek avatar da bunu kullanır.
 */
export function drawCharacter(g: CanvasRenderingContext2D, c: Character, team: 0 | 1, r: number): void {
  const L = c.look;
  const across = r * L.shoulders; // omuz yarı genişliği (y ekseni)
  const depth = r * 0.62; // gövde derinliği (x ekseni)
  // eller (omuzların önünde, ten rengi) — bileklik sol elde
  const handY = across * 0.92;
  const handR = r * 0.17;
  for (const sy of [-1, 1]) {
    g.fillStyle = L.skin;
    g.beginPath(); g.arc(r * 0.3, sy * handY, handR, 0, Math.PI * 2); g.fill();
  }
  if (L.bracelet) {
    g.strokeStyle = L.bracelet;
    g.lineWidth = handR * 0.7;
    g.beginPath(); g.arc(r * 0.3, -handY, handR * 1.05, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
  }
  // omuzlar + gövde (yuvarlak köşeli yatay kapsül)
  const grad = g.createLinearGradient(0, -across, 0, across);
  grad.addColorStop(0, KIT_DARK[team]);
  grad.addColorStop(0.5, KIT[team]);
  grad.addColorStop(1, KIT_DARK[team]);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(-r * 0.05, 0, depth, across, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(1, r * 0.09);
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.stroke();
  // yaka (V): forma hissi
  g.strokeStyle = 'rgba(4,22,27,.35)';
  g.lineWidth = Math.max(1, r * 0.07);
  g.beginPath(); g.moveTo(r * 0.5, -r * 0.28); g.lineTo(r * 0.3, 0); g.lineTo(r * 0.5, r * 0.28); g.stroke();
  // pazubent (sol omuz, yan bant)
  if (L.armband) {
    g.fillStyle = L.armband;
    g.beginPath(); g.ellipse(-r * 0.05, -across * 0.86, depth * 0.55, across * 0.13, 0, 0, Math.PI * 2); g.fill();
  }
  // baş
  const hr = r * 0.46;
  const hx = r * 0.06;
  g.fillStyle = L.skin;
  g.beginPath(); g.arc(hx, 0, hr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = Math.max(0.8, r * 0.05);
  g.stroke();
  if (L.beard) {
    // sakal: yüzün ön yayı
    g.fillStyle = L.hair;
    g.beginPath();
    g.arc(hx, 0, hr, -Math.PI * 0.45, Math.PI * 0.45);
    g.arc(hx + hr * 0.2, 0, hr * 0.68, Math.PI * 0.42, -Math.PI * 0.42, true);
    g.closePath();
    g.fill();
  }
  // saç (yukarıdan: başın arka ve üst kısmı)
  switch (L.hairStyle) {
    case 'short':
      g.fillStyle = L.hair;
      g.beginPath(); g.arc(hx - hr * 0.1, 0, hr * 0.95, Math.PI * 0.32, Math.PI * 1.68); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(hx + hr * 0.1, 0, hr * 0.6, hr * 0.7, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'curly':
      g.fillStyle = L.hair;
      for (let a = 0.38; a <= 1.62; a += 0.16) {
        g.beginPath(); g.arc(hx + Math.cos(a * Math.PI) * hr * 0.74, Math.sin(a * Math.PI) * hr * 0.74, hr * 0.34, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); g.arc(hx - hr * 0.08, 0, hr * 0.74, 0, Math.PI * 2); g.fill();
      break;
    case 'mohawk': {
      // kazınmış yanlar (soluk), ortada iki tonlu ibik
      g.fillStyle = 'rgba(60,40,28,.28)';
      g.beginPath(); g.arc(hx, 0, hr * 0.9, 0, Math.PI * 2); g.fill();
      const mg = g.createLinearGradient(hx - hr, 0, hx + hr, 0);
      mg.addColorStop(0, '#f97316');
      mg.addColorStop(1, '#fcd34d');
      g.fillStyle = mg;
      g.beginPath(); g.ellipse(hx - hr * 0.05, 0, hr * 1.08, hr * 0.3, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'ponytail':
      g.fillStyle = L.hair;
      g.beginPath(); g.arc(hx - hr * 0.06, 0, hr * 1.0, Math.PI * 0.3, Math.PI * 1.7); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(hx + hr * 0.15, 0, hr * 0.55, hr * 0.8, 0, 0, Math.PI * 2); g.fill();
      // alçak atkuyruğu: ensede, sırta doğru
      g.beginPath(); g.ellipse(hx - hr * 1.3, 0, hr * 0.55, hr * 0.26, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'buzz':
      g.fillStyle = L.hair;
      g.globalAlpha = 0.6;
      g.beginPath(); g.arc(hx - hr * 0.05, 0, hr * 0.92, Math.PI * 0.36, Math.PI * 1.64); g.closePath(); g.fill();
      g.globalAlpha = 1;
      break;
  }
  if (L.band) {
    g.strokeStyle = L.band;
    g.lineWidth = hr * 0.34;
    g.beginPath(); g.arc(hx, 0, hr * 0.84, -Math.PI * 0.6, Math.PI * 0.6); g.stroke();
  }
}

function drawBall(g: CanvasRenderingContext2D, b: Body, spin: number): void {
  g.save();
  g.translate(b.x, b.y);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 2); g.fill();
  g.clip();
  g.fillStyle = '#20232c';
  // dönen yamalar: yuvarlanmayı hissettirir
  const dir = Math.atan2(b.vy, b.vx);
  for (let i = 0; i < 3; i++) {
    const t = ((spin / (b.r * 2) + i / 3) % 1) * 2 - 1;
    g.beginPath();
    g.arc(Math.cos(dir) * t * b.r * 1.3 + Math.cos(dir + Math.PI / 2) * (i - 1) * b.r * 0.55, Math.sin(dir) * t * b.r * 1.3 + Math.sin(dir + Math.PI / 2) * (i - 1) * b.r * 0.55, b.r * 0.32, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(15,16,21,.8)';
  g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke();
}

/**
 * Portre jetonu: takım renginde disk (kalın halka) + içinde karakterin yüzü (ekrana dik, hep okunur) + halkanın
 * dışında baktığı yöne küçük ok. Boyut = çarpışma yarıçapı (fizik değişmez).
 */
function drawToken(g: CanvasRenderingContext2D, p: Player, img: HTMLImageElement): void {
  const ring = Math.max(2.6, p.r * 0.16);
  // yön oku (halkanın hemen dışında)
  const ax = Math.cos(p.face);
  const ay = Math.sin(p.face);
  const tip = p.r + 7;
  const base = p.r + 1.5;
  const half = 4.2;
  g.fillStyle = KIT[p.team];
  g.beginPath();
  g.moveTo(p.x + ax * tip, p.y + ay * tip);
  g.lineTo(p.x + ax * base - ay * half, p.y + ay * base + ax * half);
  g.lineTo(p.x + ax * base + ay * half, p.y + ay * base - ax * half);
  g.closePath();
  g.fill();
  // takım diski + yüz
  g.fillStyle = KIT[p.team];
  g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(p.x, p.y, p.r - ring, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1a1c24';
  g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  const s = (p.r - ring) * 2.06;
  g.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
  g.restore();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.stroke();
}

function drawPlayer(g: CanvasRenderingContext2D, p: Player, img: HTMLImageElement | undefined): void {
  // gölge
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(p.x + 3, p.y + 4, p.r, p.r * 0.85, 0, 0, Math.PI * 2); g.fill();
  // insan oyuncunun ayak altı halkası
  if (p.human) {
    g.strokeStyle = 'rgba(47,211,155,.95)';
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2); g.stroke();
  }
  if (p.kick) {
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 2;
    g.setLineDash([4, 4]);
    g.beginPath(); g.arc(p.x, p.y, p.r + 9, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
  }
  if (img) drawToken(g, p, img);
  else {
    // görsel yoksa (yükleniyor / bulunamadı) kodla çizilen tepeden görünüm
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.face);
    drawCharacter(g, p.c, p.team, p.r);
    g.restore();
  }
  if (p.flash) {
    g.strokeStyle = `rgba(255,255,255,${p.flash / 8})`;
    g.lineWidth = 3;
    g.beginPath(); g.arc(p.x, p.y, p.r + 2 + (8 - p.flash), 0, Math.PI * 2); g.stroke();
  }
}

export type Joy = { active: boolean; ox: number; oy: number; x: number; y: number; R: number };

/** Bir kare: tribün katmanı + saha + oyuncular + top + (varsa) sanal joystick. `spin`: topun kat ettiği yol. */
export function drawFrame(g: CanvasRenderingContext2D, v: View, stands: HTMLCanvasElement | null, w: World, spin: number, joy: Joy | null, tokens: TokenImages = {}): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (stands) g.drawImage(stands, 0, 0);
  else { g.fillStyle = NIGHT; g.fillRect(0, 0, v.w, v.h); }
  g.setTransform(v.s, 0, 0, v.s, v.cx, v.cy);
  pitch(g, w.lock ? w.lock.team : null);
  for (const q of w.posts) {
    g.fillStyle = '#f4f6f9';
    g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.fill();
    g.lineWidth = 2;
    g.strokeStyle = q.x < 0 ? KIT[0] : KIT[1];
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(w.ball.x + 2.5, w.ball.y + 3.5, w.ball.r, w.ball.r * 0.85, 0, 0, Math.PI * 2); g.fill();
  for (const p of w.players) drawPlayer(g, p, tokens[p.c.id]);
  drawBall(g, w.ball, spin);
  // insan oyuncu etiketi (ekran pikselinde net)
  const me = w.players.find((p) => p.human);
  if (me) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `700 ${Math.round(11 * v.dpr)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.fillText('SEN', v.cx + me.x * v.s, v.cy + (me.y - me.r - 9) * v.s);
  }
  if (joy?.active) {
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(joy.ox, joy.oy, joy.R, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.arc(joy.x, joy.y, 24, 0, Math.PI * 2); g.fill();
  }
}
