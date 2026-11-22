/**
 * Frikik paylaşım kartı (büyüme raporu 2.4): Wordle tarzı emoji satırı — her vuruş bir emoji; WhatsApp / X'te sonucu
 * sayfayı açmadan gösterir, merak uyandırır. Metin dili sabit (emoji evrensel); başlık/soru çeviriden gelir.
 */
import type { ShotResult } from './sim';

export function shotEmoji(r: ShotResult): string {
  if (r.kind === 'goal') return r.corner ? '🎯' : '⚽';
  if (r.kind === 'saved') return '🧤';
  if (r.kind === 'wall') return '🧱';
  if (r.kind === 'post') return '🥅';
  return '❌';
}

/** "⚽🧤🎯🧱" — 10'dan uzun koşu 10'arlı satırlara bölünür. */
export function shareGrid(results: readonly ShotResult[]): string {
  const e = results.map(shotEmoji);
  const lines: string[] = [];
  for (let i = 0; i < e.length; i += 10) lines.push(e.slice(i, i + 10).join(''));
  return lines.join('\n');
}
