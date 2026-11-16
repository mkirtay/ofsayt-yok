/**
 * Lig hafta sayfaları (/lig/{slug}/hafta/{n}; SEO raporu 2026-11-16: "Süper Lig 12. hafta maçları ve hakemleri") ve
 * sitemap'teki sezon maçları. İstekler Fixture havuzunu KULLANMAZ:
 * - `leagues/{id}?include=currentSeason` (League, 1 gün)
 * - `rounds/seasons/{season}` (Round, 1 gün) — hafta listesi
 * - `rounds/{id}?include=fixtures.participants;fixtures.scores;fixtures.state;fixtures.referees.referee` (Round; bitmiş hafta
 *   30 gün, süren 20 dk — bkz. cachePolicy `rounds`)
 * - `schedules/seasons/{season}` (Stage) — yalnız sitemap: sezonun bütün maçları tek istekte.
 * 2026-11-16 gerçek istekle doğrulandı (Süper Lig 28203, hafta 410389): hakem type_id 6 = orta hakem.
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { buildMatchHref } from '@/utils/matchUrl';

export const ROUND_FIXTURES_INCLUDE = 'fixtures.participants;fixtures.scores;fixtures.state;fixtures.referees.referee';
const MAIN_REFEREE_TYPE_ID = 6;

type RawParticipant = { id: number; name?: string; image_path?: string; meta?: { location?: 'home' | 'away' } };
type RawScore = { description?: string; score?: { goals?: number; participant?: 'home' | 'away' } };
type RawFixture = {
  id: number;
  starting_at?: string | null;
  starting_at_timestamp?: number | null;
  participants?: RawParticipant[];
  scores?: RawScore[];
  state?: { developer_name?: string; short_name?: string } | null;
  referees?: { type_id?: number; referee_id?: number; referee?: { id?: number; display_name?: string; common_name?: string; name?: string } | null }[];
};
type RawRound = { id: number; name?: string; starting_at?: string | null; ending_at?: string | null; finished?: boolean; is_current?: boolean; fixtures?: RawFixture[] };

export type SeasonRound = { id: number; week: number; start: string | null; end: string | null; finished: boolean; current: boolean };

export type WeekFixture = {
  id: number;
  href: string;
  kickoff: number | null;
  home: { id: number; name: string; logo: string | null };
  away: { id: number; name: string; logo: string | null };
  /** "2-1"; oynanmamışsa null. */
  score: string | null;
  /** NS, FT, LIVE… (Sportmonks state developer_name). */
  state: string | null;
  referee: { id: number; name: string } | null;
};

export type LeagueWeek = { round: SeasonRound; fixtures: WeekFixture[] };

export async function loadCurrentSeason(leagueId: number): Promise<{ id: number; name: string } | null> {
  const env = await sportmonksClientRequest<{ currentseason?: { id: number; name: string } | null }>('football', `/leagues/${leagueId}`, {
    include: 'currentSeason',
  });
  const d = env.data && !Array.isArray(env.data) ? env.data : null;
  return d?.currentseason ? { id: d.currentseason.id, name: d.currentseason.name } : null;
}

export function toSeasonRounds(raw: RawRound[]): SeasonRound[] {
  return raw
    .map((r) => ({
      id: r.id,
      week: Number.parseInt(String(r.name ?? ''), 10),
      start: r.starting_at ?? null,
      end: r.ending_at ?? null,
      finished: r.finished === true,
      current: r.is_current === true,
    }))
    .filter((r) => Number.isFinite(r.week) && r.week > 0)
    .sort((a, b) => a.week - b.week);
}

export async function loadSeasonRounds(seasonId: number): Promise<SeasonRound[]> {
  const env = await sportmonksClientRequest<RawRound[]>('football', `/rounds/seasons/${seasonId}`, {});
  return toSeasonRounds(Array.isArray(env.data) ? env.data : []);
}

function refereeName(r: NonNullable<RawFixture['referees']>[number]['referee']): string | null {
  return (r?.display_name || r?.common_name || r?.name || '').trim() || null;
}

export function toWeekFixture(f: RawFixture): WeekFixture | null {
  const home = f.participants?.find((p) => p.meta?.location === 'home');
  const away = f.participants?.find((p) => p.meta?.location === 'away');
  if (!home?.name || !away?.name) return null;
  const cur = (side: 'home' | 'away') => f.scores?.find((s) => s.description === 'CURRENT' && s.score?.participant === side)?.score?.goals;
  const hs = cur('home');
  const as = cur('away');
  const ref = f.referees?.find((r) => r.type_id === MAIN_REFEREE_TYPE_ID);
  const refName = ref ? refereeName(ref.referee) : null;
  const refId = ref?.referee?.id ?? ref?.referee_id;
  const kickoff = f.starting_at_timestamp ? f.starting_at_timestamp * 1000 : f.starting_at ? Date.parse(`${f.starting_at.replace(' ', 'T')}Z`) : null;
  return {
    id: f.id,
    href: buildMatchHref({ id: f.id, home: { name: home.name }, away: { name: away.name } }),
    kickoff: Number.isFinite(kickoff) ? kickoff : null,
    home: { id: home.id, name: home.name, logo: home.image_path ?? null },
    away: { id: away.id, name: away.name, logo: away.image_path ?? null },
    score: hs != null && as != null ? `${hs}-${as}` : null,
    state: f.state?.developer_name ?? null,
    referee: refName && refId ? { id: refId, name: refName } : null,
  };
}

export async function loadRoundFixtures(roundId: number): Promise<WeekFixture[]> {
  const env = await sportmonksClientRequest<RawRound>('football', `/rounds/${roundId}`, { include: ROUND_FIXTURES_INCLUDE });
  const round = env.data && !Array.isArray(env.data) ? env.data : null;
  return (round?.fixtures ?? [])
    .map(toWeekFixture)
    .filter((f): f is WeekFixture => f != null)
    .sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0) || a.id - b.id);
}

/** Varsayılan hafta: Sportmonks `is_current`; yoksa bugünü kapsayan / sıradaki; o da yoksa son hafta. */
export function pickCurrentRound(rounds: SeasonRound[], today: string): SeasonRound | null {
  return (
    rounds.find((r) => r.current) ??
    rounds.find((r) => r.end != null && r.end >= today) ??
    rounds[rounds.length - 1] ??
    null
  );
}

/** Sitemap: sezonun bütün maç adresleri (tek `schedules` isteği). */
export async function loadSeasonFixtureHrefs(seasonId: number): Promise<{ href: string; kickoff: number | null; teamIds: [number, number] }[]> {
  const env = await sportmonksClientRequest<{ rounds?: RawRound[] }[]>('football', `/schedules/seasons/${seasonId}`, {});
  const stages = Array.isArray(env.data) ? env.data : [];
  const out: { href: string; kickoff: number | null; teamIds: [number, number] }[] = [];
  for (const st of stages) for (const r of st.rounds ?? []) for (const f of r.fixtures ?? []) {
    const w = toWeekFixture(f);
    if (w) out.push({ href: w.href, kickoff: w.kickoff, teamIds: [w.home.id, w.away.id] });
  }
  return out;
}
