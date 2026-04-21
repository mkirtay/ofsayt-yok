import type { Match } from '@/models/liveScore';

export type KnockoutRoundKey = 'R16' | 'QF' | 'SF' | 'F';

/** Round metninin normalize edilmiş turu; bilinmeyense null. `R32 / 1/16` yok sayılır. */
export function normalizeRoundKey(raw?: string | null): KnockoutRoundKey | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (s === '1/8' || s === 'R16' || s === 'ROUNDOF16') return 'R16';
  if (s === '1/4' || s === 'QF' || s === 'QUARTERFINAL' || s === 'QUARTERFINALS') return 'QF';
  if (s === '1/2' || s === 'SF' || s === 'SEMIFINAL' || s === 'SEMIFINALS') return 'SF';
  if (s === 'F' || s === 'FINAL') return 'F';
  return null;
}

export const ROUND_ORDER: KnockoutRoundKey[] = ['R16', 'QF', 'SF', 'F'];

export const ROUND_LABEL: Record<KnockoutRoundKey, string> = {
  R16: 'Son 16',
  QF: 'Çeyrek Final',
  SF: 'Yarı Final',
  F: 'Final',
};

function matchSortKey(m: Match): string {
  const date = (m.date ?? '').trim();
  const time = (m.scheduled ?? m.time ?? '').trim();
  return `${date} ${time} ${m.id ?? ''}`;
}

export type BracketPair = {
  key: string;
  /** Aynı eşleşmenin iki ayağı birleşmiş olabilir; iki maç da tutulur */
  matches: Match[];
  home?: { id?: number; name?: string; logo?: string };
  away?: { id?: number; name?: string; logo?: string };
  /** Aggregate skor (iki maç toplamı), yoksa son maç skoru */
  scoreText?: string;
  /** Kazanan: 'home' | 'away' | 'tbd' */
  winner?: 'home' | 'away' | 'tbd';
};

export type BracketRound = {
  key: KnockoutRoundKey;
  label: string;
  pairs: BracketPair[];
};

/** İki takım arasındaki stabil çift anahtarı (sıralı çift id) */
function pairKey(a?: number, b?: number): string {
  const x = Number.isFinite(a) ? Number(a) : 0;
  const y = Number.isFinite(b) ? Number(b) : 0;
  return x <= y ? `${x}-${y}` : `${y}-${x}`;
}

function parseScoreNumbers(raw?: string): [number, number] | null {
  if (!raw) return null;
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(raw);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function aggregate(matches: Match[], homeId?: number): { h: number; a: number } | null {
  let h = 0;
  let a = 0;
  let found = false;
  for (const m of matches) {
    const nums = parseScoreNumbers(m.scores?.ft_score || m.scores?.score || m.score);
    if (!nums) continue;
    found = true;
    const isSameOrientation = m.home?.id === homeId;
    if (isSameOrientation) {
      h += nums[0];
      a += nums[1];
    } else {
      h += nums[1];
      a += nums[0];
    }
  }
  return found ? { h, a } : null;
}

function buildPair(matches: Match[]): BracketPair {
  const sorted = [...matches].sort((x, y) => matchSortKey(x).localeCompare(matchSortKey(y)));
  const last = sorted[sorted.length - 1]!;
  const home = last.home;
  const away = last.away;

  const agg = aggregate(sorted, home?.id);
  let scoreText: string | undefined;
  let winner: BracketPair['winner'] = 'tbd';

  if (sorted.some((m) => m.status === 'FINISHED') && agg) {
    scoreText = `${agg.h} - ${agg.a}`;
    if (agg.h > agg.a) winner = 'home';
    else if (agg.a > agg.h) winner = 'away';
    else {
      // Eşitse tekil maçın outcomes.full_time / et / pens kullan
      const fin = sorted.find((m) => m.status === 'FINISHED') ?? last;
      const ft = fin.outcomes?.full_time ?? null;
      const et = fin.outcomes?.extra_time ?? null;
      const ps = fin.outcomes?.penalty_shootout ?? null;
      const decisive = ps ?? et ?? ft;
      if (decisive === '1') winner = 'home';
      else if (decisive === '2') winner = 'away';
    }
  } else if (sorted.length) {
    scoreText = sorted[0]!.scores?.ft_score || sorted[0]!.scores?.score || '';
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

/** Önceki turun tamamlanmış çiftlerinden sıradaki tur için sentetik eşleşmeler üretir. */
function projectNextRound(
  prev: BracketRound,
  nextKey: KnockoutRoundKey
): BracketRound {
  const pairs: BracketPair[] = [];
  for (let i = 0; i < prev.pairs.length; i += 2) {
    const a = prev.pairs[i];
    const b = prev.pairs[i + 1];
    const home = a ? winnerTeam(a) : undefined;
    const away = b ? winnerTeam(b) : undefined;
    pairs.push({
      key: `proj-${nextKey}-${i / 2}`,
      matches: [],
      home,
      away,
      scoreText: undefined,
      winner: 'tbd',
    });
  }
  return { key: nextKey, label: ROUND_LABEL[nextKey], pairs };
}

/**
 * Knockout maçlarını turlara böler ve iki ayağı olan eşleşmeleri birleştirir.
 * `R16 → QF → SF → F` turları her zaman döndürülür; maç yoksa önceki turun
 * kazananlarından sentetik eşleşmeler türetilir.
 */
export function buildBracketRounds(matches: Match[]): BracketRound[] {
  const byRound = new Map<KnockoutRoundKey, Map<string, Match[]>>();

  for (const m of matches) {
    const key = normalizeRoundKey(m.round);
    if (!key) continue;
    const pk = pairKey(m.home?.id, m.away?.id);
    if (!pk) continue;
    if (!byRound.has(key)) byRound.set(key, new Map());
    const roundMap = byRound.get(key)!;
    const arr = roundMap.get(pk) ?? [];
    arr.push(m);
    roundMap.set(pk, arr);
  }

  const rounds: BracketRound[] = [];
  let anyRealData = false;

  for (const key of ROUND_ORDER) {
    const roundMap = byRound.get(key);
    if (roundMap && roundMap.size > 0) {
      anyRealData = true;
      const pairs = Array.from(roundMap.values())
        .map(buildPair)
        .sort((a, b) => {
          const am = a.matches[0];
          const bm = b.matches[0];
          return matchSortKey(am!).localeCompare(matchSortKey(bm!));
        });
      rounds.push({ key, label: ROUND_LABEL[key], pairs });
      continue;
    }

    const prev = rounds[rounds.length - 1];
    if (prev && prev.pairs.length >= 2) {
      rounds.push(projectNextRound(prev, key));
    } else {
      rounds.push({ key, label: ROUND_LABEL[key], pairs: [] });
    }
  }

  return anyRealData ? rounds : [];
}

/** Maç listesinin ana sayfadaki gibi sıralanması: canlı → planlanmış → bitmiş (en yeni üstte) */
export function sortMatchesForUefaList(matches: Match[]): Match[] {
  const rankStatus = (s: string): number => {
    if (s === 'IN PLAY') return 0;
    if (s === 'HALF TIME BREAK') return 1;
    if (s === 'NOT STARTED' || s === 'SCHEDULED') return 2;
    if (s === 'FINISHED') return 3;
    return 4;
  };
  return [...matches].sort((a, b) => {
    const ra = rankStatus(a.status);
    const rb = rankStatus(b.status);
    if (ra !== rb) return ra - rb;
    if (ra === 3) {
      // Bitmiş maçlar: en yeni üstte
      return matchSortKey(b).localeCompare(matchSortKey(a));
    }
    return matchSortKey(a).localeCompare(matchSortKey(b));
  });
}

/**
 * Lig seçimine göre canlı + fikstür + geçmiş birleşimi.
 * `fixture_id` veya `id` üzerinden tekilleştirir; canlı/bitmiş satır fikstürü ezer.
 */
export function mergeUefaCompetitionMatches(input: {
  competitionId: number;
  liveAll: Match[];
  fixtures: Match[];
  history: Match[];
}): Match[] {
  const { competitionId, liveAll, fixtures, history } = input;
  const liveForComp = liveAll.filter((m) => m.competition?.id === competitionId);

  const keyOf = (m: Match): number | null => {
    const fid = m.fixture_id != null && Number(m.fixture_id) > 0 ? Number(m.fixture_id) : null;
    if (fid != null) return fid;
    const id = Number(m.id);
    return Number.isFinite(id) ? id : null;
  };

  const map = new Map<number, Match>();
  const put = (m: Match) => {
    const k = keyOf(m);
    if (k == null) return;
    const existing = map.get(k);
    map.set(k, existing ? { ...existing, ...m, round: m.round ?? existing.round } : m);
  };

  for (const f of fixtures) put(f);
  for (const h of history) put(h);
  for (const l of liveForComp) put(l);

  return Array.from(map.values());
}
