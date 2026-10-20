/**
 * Momentum şeridinde takım renkleri — Sportmonks fixture `metadata` 161 HOME_PARTICIPANT_COLORS / 162 AWAY_PARTICIPANT_COLORS
 * (2026-10-21 doğrulandı, SL 19746587): `values = { participant: '#C40010', kit: '#C40010,#0A0A0A,…' (11 renk), location }`.
 * Renk MAÇA özel forma rengidir (GS o maçta deplasmanda beyaz #F0F0F0 giydi); takım kaydında (`teams/{id}`) renk alanı yok.
 * `metadata` alan seçimiyle (`metadata:type_id,values`) BOŞ geliyor — seçimsiz include + `metadataTypes:161,162` filtresi.
 *
 * Kurallar: ev = forma rengi; deplasman = forma rengi, ev rengine çok yakınsa (CIE76 ΔE < MIN_DISTINCT) formasındaki sıradaki
 * farklı renk (yalnız ilk 6 kit rengi — sonrakiler kaleci formasına benziyor), o da yoksa tasarım token'ı. Zemine karşı 3:1'den
 * (WCAG grafik nesne) az kontrastlı renk (beyaz açık temada, siyah koyu temada) aynı kalır, o temada aynı tonun koyulaştırılmış /
 * açıklaştırılmış hâliyle kenar çizgisi alır (kimlik korunur). İki takımdan birinin rengi yoksa `null` → bileşen token renkleri.
 */

export const MOMENTUM_COLOR_METADATA_TYPES = { HOME: 161, AWAY: 162 } as const;

/** Tasarım token'ları ($color-primary, $color-info) — renk yoksa / çakışmada yedek. */
const TOKEN_HOME = '#00a76f';
const TOKEN_AWAY = '#0ea5e9';
/** Şerit zemini (`--bg-page`), bkz. styles/_tokens.scss. */
export const MOMENTUM_THEME_BG = { light: '#f4f7f4', dark: '#0f1015' } as const;
const MIN_CONTRAST = 3;
/** Bundan yakın iki renk aynı sayılır (kırmızı–bordo ≈ 20, kırmızı–beyaz ≈ 110). */
export const MIN_DISTINCT = 30;
const KIT_CANDIDATES = 6;

export type TeamKit = { participant?: string | null; kit?: string | null };

export type MomentumTeamColor = {
  fill: string;
  /** Temada zemine karşı kontrast yetersizse kenar rengi, değilse null. */
  edge: { light: string | null; dark: string | null };
};

export type MomentumColors = { home: MomentumTeamColor; away: MomentumTeamColor };

type Rgb = [number, number, number];

function parseHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

function linear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(linear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

function lab(hex: string): Rgb {
  const [r, g, b] = rgb(hex).map(linear) as Rgb;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function colorDistance(a: string, b: string): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Zemine karşı `MIN_CONTRAST`'a ulaşana dek siyaha (açık zemin) ya da beyaza (koyu zemin) doğru karıştırır. */
export function adjustForContrast(hex: string, bg: string): string {
  const target: Rgb = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  const base = rgb(hex);
  for (let t = 0; t <= 1; t += 0.05) {
    const c = toHex(base.map((v, i) => v + (target[i]! - v) * t) as Rgb);
    if (contrastRatio(c, bg) >= MIN_CONTRAST) return c;
  }
  return toHex(target);
}

function withEdges(fill: string): MomentumTeamColor {
  const edge = (bg: string) => (contrastRatio(fill, bg) >= MIN_CONTRAST ? null : adjustForContrast(fill, bg));
  return { fill, edge: { light: edge(MOMENTUM_THEME_BG.light), dark: edge(MOMENTUM_THEME_BG.dark) } };
}

function candidates(kit: TeamKit): string[] {
  const list = [kit.participant, ...String(kit.kit ?? '').split(',').slice(0, KIT_CANDIDATES)].map(parseHex);
  return [...new Set(list.filter((c): c is string => c != null))];
}

export function pickMomentumColors(home: TeamKit | null | undefined, away: TeamKit | null | undefined): MomentumColors | null {
  const homeFill = home ? parseHex(home.participant) ?? candidates(home)[0] : null;
  const awayList = away ? candidates(away) : [];
  if (!homeFill || awayList.length === 0) return null;
  const awayFill =
    awayList.find((c) => colorDistance(c, homeFill) >= MIN_DISTINCT) ??
    [TOKEN_AWAY, TOKEN_HOME].find((c) => colorDistance(c, homeFill) >= MIN_DISTINCT) ??
    TOKEN_AWAY;
  return { home: withEdges(homeFill), away: withEdges(awayFill) };
}

type MetadataRow = { type_id?: number | null; values?: unknown };

/** Fixture `metadata` satırlarından (161/162) iki takımın forma renkleri. */
export function momentumColorsFromMetadata(rows: MetadataRow[] | null | undefined): MomentumColors | null {
  const kit = (type: number) => {
    const v = rows?.find((r) => r?.type_id === type)?.values;
    return v && typeof v === 'object' ? (v as TeamKit) : null;
  };
  return pickMomentumColors(kit(MOMENTUM_COLOR_METADATA_TYPES.HOME), kit(MOMENTUM_COLOR_METADATA_TYPES.AWAY));
}
