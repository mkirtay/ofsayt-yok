/**
 * Maç momentumu yükleyicisi (bkz. services/sportmonks/momentum.ts, uç: /api/matches/[id]/momentum).
 *
 * Maliyet: maç başına TEK `fixtures/{id}` isteği (Fixture havuzu), yalnız 3 trend türü + devreler + forma renkleri (~13 KB ham, Redis'e
 * gzip ~2 KB). Süre maç durumuna göre `cachePolicy` (`fixtures/{id}`): canlı 20 sn, yeni biten 15 dk, 1 günden eski 7 gün.
 * Sayfa SSR'ına girmez; istemci Genel Bakış'ta çeker. Havuz rezervdeyse (kalan < %30 / 429 soğuması) yalnız önbellek:
 * Redis'te yoksa Sportmonks'a gidilmez, bileşen görünmez.
 */
import {
  fetchSportmonksCached,
  sportmonksCacheControl,
  withSportmonksCacheOnly,
  type SportmonksCachedResult,
} from '@/server/sportmonks/cachedFetch';
import { isPoolInReserve, poolForPath } from '@/server/sportmonks/poolGuard';
import { mapSportmonksStateToPhase } from '@/services/sportmonks/stateMapping';
import {
  computeMomentum,
  MOMENTUM_TREND_TYPES,
  type MatchMomentumResponse,
  type PeriodRow,
  type TrendRow,
} from '@/services/sportmonks/momentum';
import { MOMENTUM_COLOR_METADATA_TYPES, momentumColorsFromMetadata } from '@/services/sportmonks/momentumColors';

export type MatchMomentumResult =
  | { kind: 'ok'; value: MatchMomentumResponse; cacheControl: string }
  /** Maç yok / başlamadı / trend verisi yok: bileşen görünmez. */
  | { kind: 'empty'; cacheControl: string }
  /** Geçici hata ya da (rezervde) önbellekte yok. */
  | { kind: 'unavailable' };

export const MOMENTUM_QUERY = {
  select: 'state_id,starting_at',
  include:
    // `metadata` alan seçimiyle boş geliyor (2026-10-21) → seçimsiz; filtre yalnız forma renkleri (161/162, ~450 B).
    'trends:participant_id,type_id,minute,value,period_id;participants:id;periods:type_id,sort_order,counts_from,period_length,minutes,ended;metadata',
  filters: `trendTypes:${Object.values(MOMENTUM_TREND_TYPES).join(',')};metadataTypes:${Object.values(MOMENTUM_COLOR_METADATA_TYPES).join(',')}`,
};

type RawFixture = {
  state_id?: number | null;
  trends?: TrendRow[] | null;
  periods?: PeriodRow[] | null;
  metadata?: { type_id?: number | null; values?: unknown }[] | null;
  participants?: { id: number; meta?: { location?: string | null } | null }[] | null;
};

export type MatchMomentumDeps = {
  fetch: (path: string, query: Record<string, string>) => Promise<SportmonksCachedResult>;
  inReserve: () => Promise<boolean>;
};

const defaultDeps: MatchMomentumDeps = {
  fetch: (path, query) => fetchSportmonksCached(path, query, { origin: 'server' }),
  inReserve: () => isPoolInReserve(poolForPath('football/fixtures'), Date.now()),
};

export async function loadMatchMomentum(matchId: string, deps: MatchMomentumDeps = defaultDeps): Promise<MatchMomentumResult> {
  let reserve = false;
  try {
    reserve = await deps.inReserve();
  } catch {
    reserve = false;
  }
  const path = `football/fixtures/${matchId}`;
  const r = reserve ? await withSportmonksCacheOnly({ misses: 0 }, () => deps.fetch(path, MOMENTUM_QUERY)) : await deps.fetch(path, MOMENTUM_QUERY);
  if (r.status !== 200) {
    if (r.status === 404 || r.status === 400 || r.status === 422) return { kind: 'empty', cacheControl: 'public, s-maxage=3600, stale-while-revalidate=3600' };
    return { kind: 'unavailable' };
  }
  const cacheControl = sportmonksCacheControl(r);
  const fixture = (r.body as { data?: RawFixture } | null)?.data;
  if (!fixture || Array.isArray(fixture)) return { kind: 'empty', cacheControl };
  const phase = fixture.state_id == null ? 'NOT STARTED' : mapSportmonksStateToPhase(fixture.state_id);
  const team = (loc: string) => fixture.participants?.find((p) => p.meta?.location === loc)?.id ?? null;
  const momentum = computeMomentum({ trends: fixture.trends, periods: fixture.periods, homeId: team('home'), awayId: team('away') });
  if (!momentum) return { kind: 'empty', cacheControl };
  return { kind: 'ok', value: { ...momentum, live: phase === 'IN PLAY' || phase === 'HALF TIME BREAK', colors: momentumColorsFromMetadata(fixture.metadata) }, cacheControl };
}
