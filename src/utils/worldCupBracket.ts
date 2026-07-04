import type { Match } from '@/models/liveScore';
import type { BracketPair, BracketRound } from '@/utils/uefaBracket';

/** Maçın `date` alanından yıl okur; yoksa null. */
export function matchSeasonYear(m: Match): number | null {
  const d = m.date?.trim();
  if (!d || d.length < 4) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) && y >= 1930 ? y : null;
}

/** LiveScore `season_id` ile sayfalarken eski turnuva maçları karışabiliyor — yıla göre süz. */
export function filterMatchesBySeasonYear(matches: Match[], year: number): Match[] {
  return matches.filter((m) => matchSeasonYear(m) === year);
}

export type WCRoundKey = 'R32' | 'R16' | 'QF' | 'SF' | 'F';

export const WC_ROUND_ORDER: WCRoundKey[] = ['R32', 'R16', 'QF', 'SF', 'F'];

export const WC_ROUND_LABEL: Record<WCRoundKey, string> = {
  R32: 'Son 32',
  R16: 'Son 16',
  QF: 'Çeyrek Final',
  SF: 'Yarı Final',
  F: 'Final',
};

function normalizeWCRound(raw?: string | null): WCRoundKey | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (s === '1/16' || s === 'R32' || s === 'ROUNDOF32') return 'R32';
  if (s === '1/8' || s === 'R16' || s === 'ROUNDOF16') return 'R16';
  if (s === '1/4' || s === 'QF' || s === 'QUARTERFINAL' || s === 'QUARTERFINALS') return 'QF';
  if (s === '1/2' || s === 'SF' || s === 'SEMIFINAL' || s === 'SEMIFINALS') return 'SF';
  if (s === 'F' || s === 'FINAL') return 'F';
  return null;
}

function pairKey(a?: number, b?: number): string {
  const x = Number.isFinite(a) ? Number(a) : 0;
  const y = Number.isFinite(b) ? Number(b) : 0;
  return x <= y ? `${x}-${y}` : `${y}-${x}`;
}

function matchSortKey(m: Match): string {
  return `${(m.date ?? '').trim()} ${(m.scheduled ?? m.time ?? '').trim()} ${m.id ?? ''}`;
}

function parseScore(raw?: string): [number, number] | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(raw ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function buildPair(matches: Match[]): BracketPair {
  const sorted = [...matches].sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
  const last = sorted[sorted.length - 1]!;
  const home = last.home;
  const away = last.away;

  let h = 0, a = 0, hasScore = false;
  for (const m of sorted) {
    const nums = parseScore(m.scores?.ft_score || m.scores?.score || m.score);
    if (!nums) continue;
    hasScore = true;
    if (m.home?.id === home?.id) { h += nums[0]; a += nums[1]; }
    else { h += nums[1]; a += nums[0]; }
  }

  let scoreText: string | undefined;
  let winner: BracketPair['winner'] = 'tbd';

  if (sorted.some((m) => m.status === 'FINISHED') && hasScore) {
    scoreText = `${h} - ${a}`;
    if (h > a) winner = 'home';
    else if (a > h) winner = 'away';
    else {
      const fin = sorted.find((m) => m.status === 'FINISHED') ?? last;
      const decisive = fin.outcomes?.penalty_shootout ?? fin.outcomes?.extra_time ?? fin.outcomes?.full_time;
      if (decisive === '1') winner = 'home';
      else if (decisive === '2') winner = 'away';
    }
  }

  return {
    key: pairKey(home?.id, away?.id) || `${last.id}`,
    matches: sorted,
    home: home ? { id: home.id, name: home.name, logo: home.logo } : undefined,
    away: away ? { id: away.id, name: away.name, logo: away.logo } : undefined,
    scoreText,
    winner,
  };
}

function winnerTeam(pair: BracketPair): BracketPair['home'] | undefined {
  if (pair.winner === 'home') return pair.home;
  if (pair.winner === 'away') return pair.away;
  return undefined;
}

function projectRound(prev: BracketRound, key: WCRoundKey): BracketRound {
  const pairs: BracketPair[] = [];
  for (let i = 0; i < prev.pairs.length; i += 2) {
    pairs.push({
      key: `proj-${key}-${i / 2}`,
      matches: [],
      home: prev.pairs[i] ? winnerTeam(prev.pairs[i]) : undefined,
      away: prev.pairs[i + 1] ? winnerTeam(prev.pairs[i + 1]) : undefined,
      winner: 'tbd',
    });
  }
  return { key, label: WC_ROUND_LABEL[key], pairs };
}

export function buildWorldCupBracketRounds(matches: Match[]): BracketRound[] {
  const byRound = new Map<WCRoundKey, Map<string, Match[]>>();

  for (const m of matches) {
    const key = normalizeWCRound(m.round);
    if (!key) continue;
    const pk = pairKey(m.home?.id, m.away?.id);
    if (!pk) continue;
    if (!byRound.has(key)) byRound.set(key, new Map());
    const rMap = byRound.get(key)!;
    const arr = rMap.get(pk) ?? [];
    arr.push(m);
    rMap.set(pk, arr);
  }

  const rounds: BracketRound[] = [];
  let anyReal = false;

  for (const key of WC_ROUND_ORDER) {
    const rMap = byRound.get(key);
    if (rMap && rMap.size > 0) {
      anyReal = true;
      const pairs = Array.from(rMap.values())
        .map(buildPair)
        .sort((a, b) => {
          const am = a.matches[0];
          const bm = b.matches[0];
          if (!am || !bm) return 0;
          return matchSortKey(am).localeCompare(matchSortKey(bm));
        });
      rounds.push({ key, label: WC_ROUND_LABEL[key], pairs });
    } else {
      const prev = rounds[rounds.length - 1];
      if (prev && prev.pairs.length >= 2) {
        rounds.push(projectRound(prev, key));
      } else {
        rounds.push({ key, label: WC_ROUND_LABEL[key], pairs: [] });
      }
    }
  }

  return anyReal ? rounds : [];
}
