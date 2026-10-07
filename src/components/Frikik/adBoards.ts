/**
 * Frikik sahası reklam panoları: kale arkası tribünde LED şeridi + korkuluklara asılı afişler (4 slot).
 * İçerik tek dosyadan gelir (lib/frikik/ads.json: metin / görsel / URL); boş slotta yalnız "Reklam vermek için iletişime
 * geçin" yazar (iletişim adresi oyunun altında DOM satırı; bileşen NEXT_PUBLIC_FRIKIK_AD_CONTACT'tan okur, yoksa satır yok). Performans: bütün panolar TEK atlas dokusu + TEK birleşik geometri (1 draw call); görseller
 * sonradan yüklenip atlasa çizilir. Panolar topun yolunda değildir (kale arkası tribün duvarı, x ≈ 11,7, y > 2,8).
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, SRGBColorSpace, Vector2, type Camera } from 'three';
import adsConfig from '@/lib/frikik/ads.json';
import { BRAND, brandText } from '@/config/brand';

export type AdKind = 'wide' | 'square' | 'tall';
/** Pano yüzünün baktığı yön: 'west' = −x (kale arkası, topa bakar); 'north' = +z (sol yan), 'south' = −z (sağ yan). */
export type AdFace = 'west' | 'north' | 'south';
export type AdEntry = { slot: string; text?: string | null; image?: string | null; url?: string | null };
export type AdsConfig = { empty: { tr: string; en: string }; ads: AdEntry[] };

/** Pano metnindeki marka yer tutucuları: `{{BRAND}}` büyük harf (LED), `{{brand}}` / `{{siteDomain}}` vb. normal (config/brand.ts). */
export function resolveAdText(text: string): string {
  return brandText(text.replace(/\{\{BRAND\}\}/g, BRAND.name.toLocaleUpperCase('tr-TR')));
}
/**
 * Slotlar (dünya, m): 4 pano, tribüne (stands.ts) oturur. `led`: ön duvarın üstünde LED şeridi (x 12,05, y 2,7–4,1);
 * `rail-l` / `rail-r`: 1. sıra taraftarlarının ÖNÜNDE (x 13,05), LED'in üstünde; `upper`: 6. sıra korkuluğunun önünde
 * (x 17,6), alt kenarı (6,8) önündeki sıraların baş hizasının (≤ 6,6) üstünde → taraftarlar metni kesmez; kamera
 * çerçevesinin içinde kalır (y ≤ 9,4). Hepsi y > 2,5
 * → kamera (~2,5 m yükseklik) için ekranda üst direğin ÜSTÜNDE; direk / ağ / top yoluyla kesişmez. Atlas hücreleri en-boy
 * oranına uyar; LED metni büyük (375 px genişlikte okunur).
 */
type Cell = { x: number; y: number; w: number; h: number };
export type AdSlot = { id: string; kind: AdKind; face: AdFace; x: number; y: number; z: number; w: number; h: number; cell: Cell; style: 'led' | 'banner' };
export const AD_SLOTS: readonly AdSlot[] = [
  { id: 'led', kind: 'wide', face: 'west', x: 12.05, y: 3.4, z: 0, w: 22, h: 1.4, cell: { x: 0, y: 0, w: 1024, h: 64 }, style: 'led' },
  { id: 'rail-l', kind: 'wide', face: 'west', x: 13.05, y: 5.1, z: -8.5, w: 6.5, h: 1.9, cell: { x: 0, y: 64, w: 448, h: 128 }, style: 'banner' },
  { id: 'rail-r', kind: 'wide', face: 'west', x: 13.05, y: 5.1, z: 8.5, w: 6.5, h: 1.9, cell: { x: 448, y: 64, w: 448, h: 128 }, style: 'banner' },
  { id: 'upper', kind: 'wide', face: 'west', x: 17.6, y: 8.1, z: 0, w: 9, h: 2.6, cell: { x: 0, y: 192, w: 576, h: 152 }, style: 'banner' },
];

const ATLAS = { w: 1024, h: 344 };

export type AdBoards = {
  mesh: Mesh;
  /** Ekran noktasına (NDC) denk gelen panonun reklamı (URL için). */
  pick: (ndc: Vector2, camera: Camera) => AdEntry | null;
  dispose: () => void;
};

/** Metni kutuya sığdırır (gerekirse küçültür, en çok 2 satır). */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, maxH: number, color: string, weight = 800) {
  let size = Math.min(maxH * 0.72, 96);
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

export function buildAdBoards(opts: { lang: 'tr' | 'en'; config?: AdsConfig }): AdBoards {
  const cfg = opts.config ?? (adsConfig as AdsConfig);
  const scale = 1;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS.w * scale;
  canvas.height = ATLAS.h * scale;
  const ctx = canvas.getContext('2d');
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const byId = new Map(cfg.ads.map((a) => [a.slot, a] as const));
  const placed = AD_SLOTS.map((slot) => ({ slot, cell: slot.cell, ad: byId.get(slot.id) ?? null }));

  const drawCell = (cell: Cell, ad: AdEntry | null, img?: HTMLImageElement, style: AdSlot['style'] = 'banner') => {
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
    } else {
      // Dolu: koyu zemin + beyaz büyük metin; boş: yalnız "Reklam vermek için iletişime geçin" (adres oyunun altında, DOM)
      const led = style === 'led';
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, led ? '#0f1a2e' : '#f4f6f9');
      g.addColorStop(1, led ? '#070d18' : '#dde3ea');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      const text = resolveAdText(ad?.text ?? (cfg.empty[opts.lang] ?? cfg.empty.tr));
      fitText(ctx, text, x + w / 2, y + h / 2, w - 4 * pad, h - 2 * pad, led ? '#ffffff' : '#0b1424', 900);
      if (led) {
        // LED şerit: alt-üst ince yeşil çizgi
        ctx.fillStyle = '#00a76f';
        ctx.fillRect(x, y, w, Math.max(2, 3 * scale));
        ctx.fillRect(x, y + h - Math.max(2, 3 * scale), w, Math.max(2, 3 * scale));
      }
    }
    if (style !== 'led') {
      ctx.strokeStyle = 'rgba(20,28,40,0.55)';
      ctx.lineWidth = Math.max(2, 4 * scale);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    ctx.restore();
  };
  for (const p of placed) drawCell(p.cell, p.ad, undefined, p.slot.style);
  tex.needsUpdate = true;

  // Görseller sonradan: yüklenince hücre yeniden çizilir (başarısızsa metin / boş pano kalır)
  let disposed = false;
  for (const p of placed) {
    if (!p.ad?.image) continue;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed) return;
      drawCell(p.cell, p.ad, img, p.slot.style);
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
  // Sis yok: uzak seviyelerde (32 m) de okunur
  const mat = new MeshBasicMaterial({ map: tex, side: DoubleSide, fog: false, toneMapped: false });
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
