/**
 * Mini Saha karakterleri. Her karakter bir şey kazanıp bir şey kaybeder (net "daha iyi" karakter yok); oynayarak açılır.
 * v2 denge (2026-11-21): hız farkı daraltıldı (en hızlı / en yavaş ≈ %16, önce %32), Sihirbaz'ın top yapıştırması
 * azaltıldı; topla koşan herkes yavaşlar (engine.ts CARRY_SLOW). `stat` çubukları bu çarpanlarla uyumlu tutulur
 * (bkz. progress.ts). Fizik çarpanları engine.ts'te okunur; `look` sahadaki çizimi, `stat` menüdeki 0–100 çubukları besler.
 *
 * Genişletme: ileride beceri (ör. kısa depar, falso) eklenecekse karaktere `skill` alanı eklenip engine.ts'teki adım
 * döngüsünde okunur; mevcut alanlar değişmeden kalır.
 */
/** Kadro sırası = açılma sırası (8 → 4 → 7 → 9 → 10). */
export const CHAR_IDS = ['dengeli', 'duvar', 'ruzgar', 'bomba', 'sihirbaz'] as const;
export type CharId = (typeof CHAR_IDS)[number];

/** Sahadaki simgenin ayrıntıları (docs/MINI_SAHA_GORSEL_PROMPTLARI.md ile eşleşir). */
export type CharLook = {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'curly' | 'mohawk' | 'ponytail' | 'buzz';
  /** Saç bandı rengi (yoksa null). */
  band: string | null;
  /** Sol el bileklik rengi (yoksa null). */
  bracelet: string | null;
  /** Sol omuz kaptan pazubendi rengi (yoksa null). */
  armband: string | null;
  beard: boolean;
  /** Omuz genişliği (yarıçapa oran; çarpışma alanı değişmez, yalnız çizim). */
  shoulders: number;
};

export type Character = {
  id: CharId;
  no: number;
  /** Hareket ivmesi çarpanı. */
  speed: number;
  /** Şut gücü çarpanı. */
  kick: number;
  /** 0–1: top sürerken topun ayağa yapışma derecesi; yüksekse top ayaktan az seker. */
  control: number;
  /** Kütle: çarpışmada itilme direnci. */
  mass: number;
  /** Yarıçap (dünya birimi). */
  r: number;
  /** Menüdeki çubuklar: hız, şut, top kontrolü, güç (0–100). */
  stat: [number, number, number, number];
  look: CharLook;
};

export const CHARACTERS: Record<CharId, Character> = {
  dengeli: {
    id: 'dengeli', no: 8, speed: 1, kick: 1, control: 0.35, mass: 1, r: 15, stat: [70, 70, 60, 65],
    look: { skin: '#c98d5f', hair: '#3d2416', hairStyle: 'short', band: null, bracelet: null, armband: null, beard: false, shoulders: 0.92 },
  },
  ruzgar: {
    id: 'ruzgar', no: 7, speed: 1.08, kick: 0.88, control: 0.3, mass: 0.88, r: 14, stat: [84, 58, 58, 48],
    look: { skin: '#7a4a2e', hair: '#1a1210', hairStyle: 'curly', band: '#f4f4f0', bracelet: null, armband: null, beard: false, shoulders: 0.84 },
  },
  bomba: {
    id: 'bomba', no: 9, speed: 0.97, kick: 1.25, control: 0.22, mass: 1.05, r: 15, stat: [66, 90, 42, 72],
    look: { skin: '#c98d5f', hair: '#f59e0b', hairStyle: 'mohawk', band: null, bracelet: null, armband: null, beard: false, shoulders: 1 },
  },
  sihirbaz: {
    id: 'sihirbaz', no: 10, speed: 0.96, kick: 0.95, control: 0.68, mass: 0.95, r: 15, stat: [64, 64, 86, 55],
    look: { skin: '#a8714a', hair: '#15100c', hairStyle: 'ponytail', band: null, bracelet: '#8b5cf6', armband: null, beard: false, shoulders: 0.86 },
  },
  duvar: {
    id: 'duvar', no: 4, speed: 0.93, kick: 1.1, control: 0.25, mass: 1.6, r: 17, stat: [58, 78, 48, 92],
    look: { skin: '#c98d5f', hair: '#2b1d14', hairStyle: 'buzz', band: null, bracelet: null, armband: '#ffd60a', beard: true, shoulders: 1 },
  },
};

export const DEFAULT_CHAR: CharId = 'dengeli';

/**
 * Portre görselleri (public/mini-saha; kaynak: docs/MINI_SAHA_GORSEL_PROMPTLARI.md): `lg` seçim ekranı, `face` maç içi
 * panel / gol bildirimi, `token` sahadaki yuvarlak jetonun içi (yalnız baş, 128 px).
 */
export function portraitSrc(id: CharId, size: 'lg' | 'face' | 'token'): string {
  return size === 'lg' ? `/mini-saha/${id}.webp` : size === 'face' ? `/mini-saha/${id}-yuz.webp` : `/mini-saha/${id}-jeton.webp`;
}

export function isCharId(v: unknown): v is CharId {
  return typeof v === 'string' && (CHAR_IDS as readonly string[]).includes(v);
}
