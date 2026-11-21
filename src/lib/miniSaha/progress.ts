/**
 * Mini Saha ilerlemesi ve karakter kilitleri — yalnız OYNAYARAK açılır (kredi yok: ileride online maç gelirse "parayla
 * güçlü karakter" olmasın). Saf modül: istemci (misafir → localStorage) ve sunucu (giriş yapmış → DB) aynı kuralı kullanır.
 */
import { CHAR_IDS, DEFAULT_CHAR, isCharId, type CharId } from './characters';
import type { Difficulty, Mode } from './engine';

export type Progress = {
  matches: number;
  wins: number;
  unlocked: CharId[];
};

export type MatchSummary = {
  mode: Mode;
  diff: Difficulty;
  goalsFor: number;
  goalsAgainst: number;
};

export type Requirement =
  | { kind: 'wins'; n: number }
  | { kind: 'goalsInMatch'; n: number }
  | { kind: 'cleanSheetWin'; minDiff: Difficulty }
  | { kind: 'beat'; diff: Difficulty };

/** Açılma şartları, kolaydan zora (kadro sırası 8 → 4 → 7 → 9 → 10). */
export const UNLOCKS: Record<CharId, Requirement | null> = {
  dengeli: null,
  duvar: { kind: 'wins', n: 3 },
  ruzgar: { kind: 'goalsInMatch', n: 3 },
  bomba: { kind: 'cleanSheetWin', minDiff: 'orta' },
  sihirbaz: { kind: 'beat', diff: 'zor' },
};

const DIFF_RANK: Record<Difficulty, number> = { kolay: 0, orta: 1, zor: 2 };

export function emptyProgress(): Progress {
  return { matches: 0, wins: 0, unlocked: [DEFAULT_CHAR] };
}

/** Bu maç şartı sağladı mı (birikimli `wins` hariç). */
function matchMeets(req: Requirement, m: MatchSummary, winsAfter: number): boolean {
  const won = m.goalsFor > m.goalsAgainst;
  switch (req.kind) {
    case 'wins':
      return winsAfter >= req.n;
    case 'goalsInMatch':
      return m.goalsFor >= req.n;
    case 'cleanSheetWin':
      return won && m.goalsAgainst === 0 && DIFF_RANK[m.diff] >= DIFF_RANK[req.minDiff];
    case 'beat':
      return won && DIFF_RANK[m.diff] >= DIFF_RANK[req.diff];
  }
}

/** Biten maçı ilerlemeye işler; yeni açılan karakterleri döner. Girdi değiştirilmez. */
export function applyMatch(prev: Progress, m: MatchSummary): { progress: Progress; newlyUnlocked: CharId[] } {
  const won = m.goalsFor > m.goalsAgainst;
  const wins = prev.wins + (won ? 1 : 0);
  const newlyUnlocked = CHAR_IDS.filter((id) => {
    const req = UNLOCKS[id];
    return req !== null && !prev.unlocked.includes(id) && matchMeets(req, m, wins);
  });
  const unlocked = CHAR_IDS.filter((id) => prev.unlocked.includes(id) || newlyUnlocked.includes(id) || UNLOCKS[id] === null);
  return { progress: { matches: prev.matches + 1, wins, unlocked }, newlyUnlocked };
}

/** Dışarıdan gelen (localStorage / DB / istek gövdesi) veriyi güvenli Progress'e çevirir. */
export function sanitizeProgress(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? Math.min(v as number, 1_000_000) : 0);
  const list = Array.isArray(r.unlocked) ? r.unlocked.filter(isCharId) : [];
  return {
    matches: int(r.matches),
    wins: Math.min(int(r.wins), int(r.matches)),
    unlocked: CHAR_IDS.filter((id) => UNLOCKS[id] === null || list.includes(id)),
  };
}

/** Maç özeti doğrulaması (sunucu): makul aralık dışı → null. */
export function parseSummary(raw: unknown): MatchSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const goal = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 40;
  if (r.mode !== '1v1' && r.mode !== '2v2') return null;
  if (r.diff !== 'kolay' && r.diff !== 'orta' && r.diff !== 'zor') return null;
  if (!goal(r.goalsFor) || !goal(r.goalsAgainst)) return null;
  return { mode: r.mode, diff: r.diff, goalsFor: r.goalsFor as number, goalsAgainst: r.goalsAgainst as number };
}

/** İki ilerlemenin birleşimi (misafir → hesap taşıma): sayılar büyük olan, kilitler birleşim. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  return {
    matches: Math.max(a.matches, b.matches),
    wins: Math.max(a.wins, b.wins),
    unlocked: CHAR_IDS.filter((id) => a.unlocked.includes(id) || b.unlocked.includes(id)),
  };
}

/** Kilitli karakter için ilerleme göstergesi (yalnız birikimli şartta anlamlı): { have, need } ya da null. */
export function requirementProgress(req: Requirement, p: Progress): { have: number; need: number } | null {
  return req.kind === 'wins' ? { have: Math.min(p.wins, req.n), need: req.n } : null;
}
