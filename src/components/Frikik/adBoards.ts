/**
 * Frikik sahası reklam panoları: kale arkasında ve tribün yanında karışık boyutlu (geniş / kare / dikey) panolar.
 * İçerik tek dosyadan gelir (lib/frikik/ads.json: metin / görsel / URL); boş slotta "Reklam vermek için iletişime geçin"
 * + iletişim adresi yazar. Performans: bütün panolar TEK atlas dokusu + TEK birleşik geometri (1 draw call); görseller
 * sonradan yüklenip atlasa çizilir. Panolar topun yolunda değildir (kale arkası x > 6, yanlar |z| > 27).
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, SRGBColorSpace, Vector2, type Camera } from 'three';
import adsConfig from '@/lib/frikik/ads.json';

export type AdKind = 'wide' | 'square' | 'tall';
/** Pano yüzünün baktığı yön: 'west' = −x (kale arkası, topa bakar); 'north' = +z (sol yan), 'south' = −z (sağ yan). */
export type AdFace = 'west' | 'north' | 'south';
export type AdSlot = { id: string; kind: AdKind; face: AdFace; x: number; y: number; z: number; w: number; h: number };
export type AdEntry = { slot: string; text?: string | null; image?: string | null; url?: string | null };
export type AdsConfig = { contact: string; empty: { tr: string; en: string }; ads: AdEntry[] };

/** Slotlar (dünya, m). Kale arkası x = 8,5 (OFSAYT YOK şeridi 6,2 ile tribün 12 arasında); yanlar |z| = 27,5. */
export const AD_SLOTS: readonly AdSlot[] = [
  { id: 'goal-wide-l', kind: 'wide', face: 'west', x: 8.5, y: 1.5, z: -6.5, w: 7, h: 1.6 },
  { id: 'goal-wide-r', kind: 'wide', face: 'west', x: 8.5, y: 1.5, z: 6.5, w: 7, h: 1.6 },
  { id: 'goal-square-l', kind: 'square', face: 'west', x: 8.5, y: 1.8, z: -12, w: 2.2, h: 2.2 },
  { id: 'goal-square-r', kind: 'square', face: 'west', x: 8.5, y: 1.8, z: 12, w: 2.2, h: 2.2 },
  { id: 'goal-tall-l', kind: 'tall', face: 'west', x: 8.5, y: 2.4, z: -15.5, w: 1.6, h: 3.4 },
  { id: 'goal-tall-r', kind: 'tall', face: 'west', x: 8.5, y: 2.4, z: 15.5, w: 1.6, h: 3.4 },
  { id: 'side-wide-l', kind: 'wide', face: 'north', x: -14, y: 1.0, z: -27.5, w: 10, h: 1.5 },
  { id: 'side-wide-r', kind: 'wide', face: 'south', x: -14, y: 1.0, z: 27.5, w: 10, h: 1.5 },
  { id: 'side-square-l', kind: 'square', face: 'north', x: -24, y: 1.3, z: -27.5, w: 2, h: 2 },
  { id: 'side-square-r', kind: 'square', face: 'south', x: -24, y: 1.3, z: 27.5, w: 2, h: 2 },
];

/** Atlas hücreleri (1024×768 tabanında px): geniş 512×128 ×4, kare 256×256 ×4, dikey 128×256 ×2. */
const ATLAS = { w: 1024, h: 768 };
const CELLS: Record<AdKind, { x: number; y: number; w: number; h: number }[]> = {
  wide: [0, 128, 256, 384].map((y) => ({ x: 0, y, w: 512, h: 128 })),
  square: [
    { x: 512, y: 0, w: 256, h: 256 },
    { x: 768, y: 0, w: 256, h: 256 },
    { x: 512, y: 256, w: 256, h: 256 },
    { x: 768, y: 256, w: 256, h: 256 },
  ],
  tall: [
    { x: 512, y: 512, w: 128, h: 256 },
    { x: 640, y: 512, w: 128, h: 256 },
  ],
};

export type AdBoards = {
  mesh: Mesh;
  /** Ekran noktasına (NDC) denk gelen panonun reklamı (URL için). */
  pick: (ndc: Vector2, camera: Camera) => AdEntry | null;
  dispose: () => void;
};

/** Metni kutuya sığdırır (gerekirse küçültür, en çok 2 satır). */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, maxH: number, color: string, weight = 800) {
  let size = Math.min(maxH * 0.6, 72);
  const lines = (s: number): string[] => {
    ctx.font = `${weight} ${s}px Inter, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW) return [text];
    const words = text.split(' ');
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !cur) cur = next;
      else {
        out.push(cur);
        cur = w;
      }
    }
    out.push(cur);
    return out;
  };
  let ls = lines(size);
  while (size > 12 && (ls.length > 2 || ls.some((l) => ctx.measureText(l).width > maxW) || ls.length * size * 1.15 > maxH)) {
    size -= 2;
    ls = lines(size);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.15;
  ls.forEach((l, i) => ctx.fillText(l, x, y + (i - (ls.length - 1) / 2) * lh));
}

export function buildAdBoards(opts: { lite: boolean; lang: 'tr' | 'en'; config?: AdsConfig }): AdBoards {
  const cfg = opts.config ?? (adsConfig as AdsConfig);
  const scale = opts.lite ? 0.5 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS.w * scale;
  canvas.height = ATLAS.h * scale;
  const ctx = canvas.getContext('2d');
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const byId = new Map(cfg.ads.map((a) => [a.slot, a] as const));
  const counters: Record<AdKind, number> = { wide: 0, square: 0, tall: 0 };
  const placed: { slot: AdSlot; cell: { x: number; y: number; w: number; h: number }; ad: AdEntry | null }[] = [];
  for (const slot of AD_SLOTS) {
    const cell = CELLS[slot.kind][counters[slot.kind]++];
    if (!cell) continue;
    placed.push({ slot, cell, ad: byId.get(slot.id) ?? null });
  }

  const drawCell = (cell: { x: number; y: number; w: number; h: number }, ad: AdEntry | null, img?: HTMLImageElement) => {
    if (!ctx) return;
    const x = cell.x * scale;
    const y = cell.y * scale;
    const w = cell.w * scale;
    const h = cell.h * scale;
    const pad = Math.round(6 * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (img) {
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(x, y, w, h);
      const k = Math.min((w - 2 * pad) / img.width, (h - 2 * pad) / img.height);
      const dw = img.width * k;
      const dh = img.height * k;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else if (ad?.text) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#13213a');
      g.addColorStop(1, '#0b1424');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      fitText(ctx, ad.text, x + w / 2, y + h / 2, w - 4 * pad, h - 3 * pad, '#ffffff');
    } else {
      ctx.fillStyle = '#e9edf3';
      ctx.fillRect(x, y, w, h);
      const empty = cfg.empty[opts.lang] ?? cfg.empty.tr;
      const tall = h > w;
      fitText(ctx, empty, x + w / 2, y + h * (tall ? 0.42 : 0.4), w - 4 * pad, h * (tall ? 0.42 : 0.38), '#1c2430');
      fitText(ctx, cfg.contact, x + w / 2, y + h * (tall ? 0.78 : 0.76), w - 4 * pad, h * 0.2, '#00704c', 600);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(2, 4 * scale);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.restore();
  };
  for (const p of placed) drawCell(p.cell, p.ad);
  tex.needsUpdate = true;

  // Görseller sonradan: yüklenince hücre yeniden çizilir (başarısızsa metin / boş pano kalır)
  let disposed = false;
  for (const p of placed) {
    if (!p.ad?.image) continue;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed) return;
      drawCell(p.cell, p.ad, img);
      tex.needsUpdate = true;
    };
    img.src = p.ad.image;
  }

  // Tek birleşik geometri: her pano bir dörtgen; UV'ler atlas hücresine (u sol→sağ, izleyiciye göre)
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  placed.forEach((p, i) => {
    const { slot: s, cell } = p;
    const u0 = cell.x / ATLAS.w;
    const u1 = (cell.x + cell.w) / ATLAS.w;
    const v1 = 1 - cell.y / ATLAS.h;
    const v0 = 1 - (cell.y + cell.h) / ATLAS.h;
    const y0 = s.y - s.h / 2;
    const y1 = s.y + s.h / 2;
    // Köşeler: izleyicinin solu-altı, sağı-altı, sağı-üstü, solu-üstü
    let corners: [number, number, number][];
    if (s.face === 'west') corners = [[s.x, y0, s.z - s.w / 2], [s.x, y0, s.z + s.w / 2], [s.x, y1, s.z + s.w / 2], [s.x, y1, s.z - s.w / 2]];
    else if (s.face === 'north') corners = [[s.x + s.w / 2, y0, s.z], [s.x - s.w / 2, y0, s.z], [s.x - s.w / 2, y1, s.z], [s.x + s.w / 2, y1, s.z]];
    else corners = [[s.x - s.w / 2, y0, s.z], [s.x + s.w / 2, y0, s.z], [s.x + s.w / 2, y1, s.z], [s.x - s.w / 2, y1, s.z]];
    for (const c of corners) pos.push(...c);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new MeshBasicMaterial({ map: tex, side: DoubleSide, fog: true, toneMapped: false });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = true;

  const ray = new Raycaster();
  const pick = (ndc: Vector2, camera: Camera): AdEntry | null => {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) return null;
    const q = hit.point;
    for (const p of placed) {
      const s = p.slot;
      const lateral = s.face === 'west' ? Math.abs(q.z - s.z) : Math.abs(q.x - s.x);
      if (lateral <= s.w / 2 + 0.05 && Math.abs(q.y - s.y) <= s.h / 2 + 0.05) return p.ad;
    }
    return null;
  };

  return {
    mesh,
    pick,
    dispose() {
      disposed = true;
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
