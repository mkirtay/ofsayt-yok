/**
 * Sahne noktalarının renkleri — saf modül. Takım rengi maça özel formadan (`SceneSquad.color`, metadata 161/162; deplasman ev
 * rengine çok yakınsa sunucu zaten formasındaki diğer rengi seçer). Renk yoksa kontrastlı yedek: ev açık, deplasman koyu;
 * yalnız biri gelmişse diğeri ona uzak yedekten. Kaleciler iki takımdan, çimden ve birbirinden ayrışan sabit paletten.
 * Numara rengi zemine göre siyah/beyaz; açık renge koyu, koyu renge açık kenar (çimde ve birbirinde kaybolmasın).
 */
import { colorDistance, contrastRatio, MIN_DISTINCT } from '@/services/sportmonks/momentumColors';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';
import type { SceneSide } from '@/services/sportmonks/matchCommentary';

export type DotColor = { fill: string; text: string; edge: string };
export type SceneKits = Record<SceneSide, { outfield: DotColor; keeper: DotColor }>;

/** Çim (turf.module.scss) — kaleci rengi buna da uzak olmalı. */
const GRASS = '#00a76f';
const FALLBACK_HOME = '#ffffff';
const FALLBACK_AWAY = '#1d3a8a';
const ALT_AWAY = ['#1d3a8a', '#111111', '#ffffff', '#e03131'];
/** Kaleci adayları: sarı, turuncu, mor, camgöbeği, pembe, siyah. */
const KEEPER = ['#f5d90a', '#ff7a1a', '#7b2ff7', '#18d4e8', '#ff4fa3', '#1a1a1a'];

const hex = (v: string | null | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

export function dotColor(fill: string): DotColor {
  const dark = contrastRatio(fill, '#ffffff') >= contrastRatio(fill, '#111111');
  return { fill, text: dark ? '#ffffff' : '#111111', edge: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)' };
}

export function sceneKits(squads: SceneSquads | null): SceneKits {
  let home = hex(squads?.home.color);
  let away = hex(squads?.away.color);
  if (!home) home = away && colorDistance(away, FALLBACK_HOME) < MIN_DISTINCT ? FALLBACK_AWAY : FALLBACK_HOME;
  if (!away || colorDistance(away, home) < MIN_DISTINCT) away = ALT_AWAY.find((c) => colorDistance(c, home!) >= MIN_DISTINCT) ?? FALLBACK_AWAY;
  const taken = [home, away, GRASS];
  const keeper = () => {
    const best = [...KEEPER].sort((a, b) => Math.min(...taken.map((t) => colorDistance(b, t))) - Math.min(...taken.map((t) => colorDistance(a, t))))[0]!;
    taken.push(best);
    return best;
  };
  return {
    home: { outfield: dotColor(home), keeper: dotColor(keeper()) },
    away: { outfield: dotColor(away), keeper: dotColor(keeper()) },
  };
}

/** "Mohamed Salah" → "M. Salah"; tek ad olduğu gibi ("Fabinho"). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  return `${parts[0]!.charAt(0)}. ${parts.slice(1).join(' ')}`;
}

/** Vurgu etiketi: yalnız soyad (son sözcük; "van Dijk" gibi bağlaçlı soyad korunur). */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  const lower = parts.findIndex((p, i) => i > 0 && i < parts.length - 1 && /^(de|da|van|von|der|den|di|du|le|la|el|al|dos|ter)$/i.test(p));
  return parts.slice(lower > 0 ? lower : -1).join(' ');
}
