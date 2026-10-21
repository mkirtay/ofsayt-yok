/**
 * X tweet metinleri — DÜZ template-string (LLM yok): her sayı / isim veriden gelir, eksikse ilgili satır yazılmaz.
 * Bahis dili yok (src/utils/gamblingTerms). Ana tweet'te bağlantı YOK: X, bağlantılı gönderiyi çok daha pahalı faturalıyor.
 */
import type { GoalFacts } from '@/lib/gundem/bot/goalTemplates';
import { formatMinute } from '@/lib/gundem/bot/goalTemplates';

export const TWEET_MAX = 270; // 280 sınırının altında pay (emoji 2 sayılır)

/** X sayacı: emoji ve BMP dışı karakterler 2. */
export function tweetLength(text: string): number {
  let n = 0;
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  return n;
}

const GOAL_OPENERS = ['Gol!', 'Ağlar havalandı!', 'Skor değişti!'];

/** Aynı maçta aynı açılış üst üste gelmesin diye deterministik: dakika + id. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

export function renderGoalTweet(f: GoalFacts, seed: number): string {
  const min = formatMinute(f.minute, f.extraMinute);
  const lines: string[] = [];
  if (f.kind === 'own-goal') lines.push(`⚽ Kendi kalesine gol! ${min} ${f.playerName}`);
  else if (f.kind === 'penalty') lines.push(`⚽ Penaltıdan gol! ${min} ${f.playerName}${f.teamName ? ` (${f.teamName})` : ''}`);
  else lines.push(`⚽ ${pick(GOAL_OPENERS, seed)} ${min} ${f.playerName}${f.teamName ? ` (${f.teamName})` : ''}`);
  if (f.score) lines.push(`${f.homeName} ${f.score.home}-${f.score.away} ${f.awayName}`);
  if (f.leagueName) lines.push(f.leagueName);
  lines.push('#Scor3');
  return lines.join('\n');
}

export type FinalGoal = { minute: number; extraMinute?: number | null; player: string; side: 'home' | 'away'; own?: boolean };
export type FinalFacts = {
  homeName: string;
  awayName: string;
  score: [number, number];
  leagueName: string | null;
  goals: FinalGoal[];
  /** Uzatma / penaltılarla bitti: ek satır. */
  note: string | null;
};

/** "Soriba Diaoune 7', 39'" — aynı oyuncu tek satır, kendi kalesine gol "(KK)". */
function goalLine(goals: FinalGoal[], side: 'home' | 'away', max: number): string[] {
  const groups = new Map<string, string[]>();
  for (const g of goals.filter((x) => x.side === side)) {
    const key = g.own ? `${g.player}#kk` : g.player;
    const m = `${formatMinute(g.minute, g.extraMinute ?? null)}${g.own ? ' (KK)' : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const rows = [...groups.entries()].map(([k, mins]) => `${k.replace('#kk', '')} ${mins.join(', ')}`);
  if (rows.length <= max) return rows;
  const rest = rows.slice(max - 1).length;
  return [...rows.slice(0, max - 1), `+${rest} gol daha`];
}

export function renderFinalTweet(f: FinalFacts): string {
  const build = (max: number) => {
    const lines = [`Maç sonu: ${f.homeName} ${f.score[0]}-${f.score[1]} ${f.awayName}`];
    if (f.note) lines.push(f.note);
    const h = goalLine(f.goals, 'home', max);
    const a = goalLine(f.goals, 'away', max);
    if (h.length || a.length) lines.push('');
    if (h.length) lines.push(`⚽ ${f.homeName}: ${h.join(', ')}`);
    if (a.length) lines.push(`⚽ ${f.awayName}: ${a.join(', ')}`);
    if (f.leagueName) lines.push('', f.leagueName);
    lines.push('#Scor3');
    return lines.join('\n');
  };
  for (const max of [6, 4, 3, 2, 1]) {
    const t = build(max);
    if (tweetLength(t) <= TWEET_MAX) return t;
  }
  return `Maç sonu: ${f.homeName} ${f.score[0]}-${f.score[1]} ${f.awayName}\n#Scor3`;
}
