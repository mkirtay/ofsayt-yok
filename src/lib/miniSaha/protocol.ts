/**
 * Mini Saha online protokolü — tarayıcı (components/MiniSaha/online.ts) ile oyun sunucusu (oyun-sunucusu/, Cloudflare
 * Durable Object; mantık lib/miniSaha/room.ts) arasında JSON mesajları. Kısa alan adları: mesajlar saniyede onlarca kez
 * gider. Sunucuya giden mesajlar ücretsiz kotadan sayıldığı için girdi yalnız DEĞİŞİNCE (kaba adımlarla) gönderilir.
 */
import { isCharId, type CharId } from './characters';
import type { Input } from './engine';

/** Online maç süresi (sn). */
export const ONLINE_DUR_SEC = 180;
/** Maç öncesi geri sayım (tik). */
export const COUNTDOWN_TICKS = 180;
/** Kaç tikte bir anlık görüntü (60 Hz / 2 = 30 Hz). Sunucudan giden mesajlar ücretsiz. */
export const SNAPSHOT_EVERY = 2;
/** Kopan oyuncunun geri dönmesi için bekleme (tik; 20 sn). Sonra hükmen biter. */
export const RECONNECT_GRACE_TICKS = 20 * 60;
/** İkinci oyuncu gelmezse oda kapanır (tik; 10 dk). */
export const WAIT_TIMEOUT_TICKS = 10 * 60 * 60;
/** Maç bitince rövanş beklenmezse oda kapanır (tik; 5 dk). */
export const END_TIMEOUT_TICKS = 5 * 60 * 60;
/** Oyuncu başına saniyede en fazla kabul edilen mesaj. */
export const MAX_MSGS_PER_SEC = 40;

export type RoomPhase = 'bekliyor' | 'sayim' | 'oyun' | 'bitti';

/** Tarayıcı → sunucu. */
export type ClientMsg =
  /** merhaba: karakter + takma ad (bağlanınca ve maç başlamadan değiştirince) */
  | { t: 'm'; ch: CharId; ad: string | null }
  /** girdi: x, y ∈ [−1, 1] (1/4 adımlı), k = şut basılı */
  | { t: 'g'; x: number; y: number; k: 0 | 1 }
  /** rövanş isteği */
  | { t: 'r' };

/** Oda durumu (değişince gönderilir). `slot`: alıcının yeri (0 kuran, 1 davetli); `anahtar`: yeniden bağlanma için. */
export type RoomStateMsg = {
  t: 'o';
  slot: 0 | 1;
  anahtar: string;
  faz: RoomPhase;
  ch: [CharId | null, CharId | null];
  /** Takma adlar (yoksa null: istemci karakter adını gösterir). */
  ad: [string | null, string | null];
  bagli: [boolean, boolean];
  /** Geri sayımda kalan sn. */
  sayim: number;
  rovans: [boolean, boolean];
  /** Bitti: kazanan yer (berabere / yok: null) ve neden. */
  kazanan: 0 | 1 | null;
  neden: 'sure' | 'hukmen' | null;
};

/**
 * Anlık görüntü. p: [x, y, vx, vy, bakış×100, şut, parlama] her yer için; b: top [x, y, vx, vy]; ev: olaylar
 * (['k', yer] vuruş, ['g', takım, golü atan yer | −1] gol, ['a'] altın gol, ['e'] bitti).
 */
export type SnapshotMsg = {
  t: 's';
  tk: number;
  d: number;
  b: [number, number, number, number];
  p: [number, number, number, number, number, 0 | 1, number][];
  sc: [number, number];
  al: 0 | 1;
  f: 'play' | 'goal' | 'end';
  k: -1 | 0 | 1;
  ev: SnapEvent[];
};

export type SnapEvent = ['k', number] | ['g', 0 | 1, number] | ['a'] | ['e'];

/** Hata (ardından bağlantı kapanır). */
export type ErrorMsg = { t: 'h'; kod: 'dolu' | 'gecersiz' | 'zaman' };

export type ServerMsg = RoomStateMsg | SnapshotMsg | ErrorMsg;

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/**
 * Takma ad biçimi (sunucu da uygular): baş/son boşluk ve çoklu boşluk sadeleşir; yalnız harf (Türkçe dahil), rakam,
 * boşluk, _ . - ; 3–16 karakter. Uymuyorsa null. İçerik filtresi istemcide (lib/miniSaha/nickname.ts).
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length < NAME_MIN || v.length > NAME_MAX) return null;
  return /^[\p{L}\p{N} _.-]+$/u.test(v) ? v : null;
}

/** Oda kodu: karışan harfler (0/O, 1/I/L) yok. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

export function newRoomCode(rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}

/** Girdiyi kaba adımlara yuvarlar: joystick titremesi her karede yeni mesaj üretmesin. */
export function quantizeInput(i: Input): { x: number; y: number; k: 0 | 1 } {
  let { x, y } = i;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  const q = (v: number) => Math.round(v * 4) / 4;
  return { x: q(x), y: q(y), k: i.kick ? 1 : 0 };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
export { r2 as round2 };

/** Gelen ham mesajı doğrular (sunucu tarafı); geçersizse null. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.t === 'm') return isCharId(o.ch) ? { t: 'm', ch: o.ch, ad: cleanName(o.ad) } : null;
  if (o.t === 'r') return { t: 'r' };
  if (o.t === 'g') {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : null);
    const x = num(o.x);
    const y = num(o.y);
    if (x === null || y === null) return null;
    return { t: 'g', x, y, k: o.k === 1 ? 1 : 0 };
  }
  return null;
}
