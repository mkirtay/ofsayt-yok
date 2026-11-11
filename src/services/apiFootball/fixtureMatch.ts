/**
 * Bizim maç (Sportmonks id'li) ↔ API-Football maçı eşlemesi: başlama saati (± pencere) + normalize takım adı.
 * Eşleşmeyen / belirsiz (birden fazla aday) maçta null → oran gösterilmez (yanlış maçın oranı gösterilmesin).
 */
import { normalizeSearchText } from '@/utils/searchText';

export type AfFixtureSlim = {
  id: number;
  ts: number;
  home: string;
  away: string;
  leagueId: number;
};

/** Kulüp ön/son ekleri: adın ayırt edici kısmı değil. */
const NOISE = new Set([
  'fc',
  'cf',
  'sk',
  'fk',
  'afc',
  'ac',
  'sc',
  'cd',
  'sv',
  'ssc',
  'as',
  'us',
  'rc',
  'rcd',
  'ud',
  'bk',
  'if',
  'jk',
  'sd',
  'ca',
  'cs',
  'fsv',
  'vfb',
  'vfl',
  'tsg',
  'rb',
  'de',
  'the',
]);

/** Sağlayıcılar arasında yazımı ayrışan sözcükler (normalize sonrası): Sportmonks yerel, AF İngilizce yazabiliyor. */
const ALIASES: Record<string, string> = {
  munchen: 'munich',
  koln: 'cologne',
  internazionale: 'inter',
  kobenhavn: 'copenhagen',
  olympiacos: 'olympiakos',
};

export function normalizeTeamName(name: string): string {
  return normalizeSearchText(name)
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t))
    .map((t) => ALIASES[t] ?? t)
    .join(' ');
}

function bigrams(s: string): string[] {
  const t = s.replace(/ /g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.length === 0 || y.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      common += 1;
      pool.set(g, n - 1);
    }
  }
  return (2 * common) / (x.length + y.length);
}

/** İki sağlayıcının takım adı aynı takıma mı ait: eşit, biri diğerinin kelime alt kümesi ("Inter" ⊂ "Inter Milan") ya da çok benzer. */
export function teamNamesMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Her kısa sözcük, uzun addaki bir sözcüğün kendisi ya da ≥ 4 harfli öneki ("brest" → "brestois", "lyon" → "lyonnais").
  const covered = small.every((t) => big.some((u) => u === t || (t.length >= 4 && u.startsWith(t))));
  if (covered && small.join('').length >= 4) return true;
  return dice(na, nb) >= 0.8;
}

export const KICKOFF_TOLERANCE_MS = 30 * 60_000;
/** Tek takım adıyla eşleşme için daha sıkı saat toleransı. */
export const ONE_TEAM_TOLERANCE_MS = 10 * 60_000;

export type FixtureMatchQuality = 'both-teams' | 'time-and-one-team';
export type FixtureMatchResult = {
  fixture: AfFixtureSlim;
  quality: FixtureMatchQuality;
};

/**
 * 1) Saat toleransı içinde ev VE deplasman adı eşleşen fixture (birden fazlaysa saati en yakın olan).
 * 2) Yoksa: ±10 dk içinde, takımlardan BİRİ eşleşen TEK fixture — aynı takım aynı saatte iki maç oynayamaz; diğer takımın adı
 *    sağlayıcılar arasında ayrışıyor olabilir ("Olympique Lyonnais" / "Lyon"). `quality` ile işaretlenir.
 * Hiçbiri değilse null → oran gösterilmez.
 */
export function matchFixture(
  ours: { kickoffMs: number; home: string; away: string },
  fixtures: readonly AfFixtureSlim[],
  toleranceMs: number = KICKOFF_TOLERANCE_MS,
): FixtureMatchResult | null {
  const dist = (f: AfFixtureSlim) => Math.abs(f.ts * 1000 - ours.kickoffMs);
  const both = fixtures
    .filter((f) => dist(f) <= toleranceMs && teamNamesMatch(ours.home, f.home) && teamNamesMatch(ours.away, f.away))
    .sort((a, b) => dist(a) - dist(b));
  if (both.length > 0) return { fixture: both[0], quality: 'both-teams' };
  const one = fixtures.filter(
    (f) => dist(f) <= ONE_TEAM_TOLERANCE_MS && teamNamesMatch(ours.home, f.home) !== teamNamesMatch(ours.away, f.away),
  );
  return one.length === 1 ? { fixture: one[0], quality: 'time-and-one-team' } : null;
}
