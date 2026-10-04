/**
 * Ana sayfa ilk ekran verisinin (ISR props) şekli ve paketleme — sunucu (`server/homeInitialData.ts`) ile istemci
 * (`MatchHubPage` → react-query tohumlama) arasında ortak. Sunucuya özgü import YOK (Redis vb. tarayıcıya girmesin).
 */
import type { Match } from '@/models/liveScore';
import type { TurkeyTeamTiersPayload } from '@/config/turkeyTiers';
import type { UpcomingLeagueDay } from '@/server/homeDay';
import type { CompetitionSidebarData } from '@/hooks/useCompetitionSidebar';

/** Lig başlığı: aynı ligdeki maçların ortak `competition` + `country` nesneleri tek kez taşınır. */
export type PackedLeague = Pick<Match, 'competition' | 'country'>;
/** `g` = `leagues` içindeki indeks (maçın `competition`/`country` alanları oradan gelir). */
export type PackedMatch = Omit<Match, 'competition' | 'country'> & { g: number };

export type HomeInitialMatches = {
  leagues: PackedLeague[];
  fixtures: PackedMatch[];
  /** Canlı maçlar, API sırasıyla: sayı = `fixtures` içindeki indeks (aynı maç iki kez taşınmasın), nesne = başka günün canlı maçı. */
  live: Array<number | PackedMatch>;
  /** Yalnız eski sağlayıcı (Sportmonks'ta fikstürle aynı liste → yok). */
  history?: PackedMatch[];
  /** Gece maçları (ertesi gün 00:00–06:00 TSİ); yoksa alan yok. */
  night?: PackedMatch[];
};

export type HomeInitialData = {
  /** Üretildiği TR günü — istemcinin ilk `selectedDate`'i (mount'ta gerçek gün farklıysa değişir). */
  date: string;
  matches: HomeInitialMatches;
  /** Yalnızca gün boşken: takip edilen liglerin sıradaki maç günleri (`null` → istemci çeker). */
  upcoming: UpcomingLeagueDay[] | null;
  sidebar: { competitionId: number; data: CompetitionSidebarData } | null;
  /** Yalnızca listede Türkiye Kupası maçı varsa. */
  cupTiers: TurkeyTeamTiersPayload | null;
};

// ─── Kırpma ─────────────────────────────────────────────────────────────────

/** Liste / birleştirme / lig filtresi / maç linki tarafından okunmayan alanlar (yalnız maç detayı kullanır). */
const DROPPED_MATCH_FIELDS = [
  'location',
  'referee',
  'referee_id',
  'season_id',
  'round',
  'stage',
  'added',
  'outcomes',
  'urls',
  'odds',
  'tv_stations',
  'coaches',
  'weather',
  'hashtag',
] as const;

export function trimListMatch(m: Match): Match {
  const out: Record<string, unknown> = { ...m };
  for (const k of DROPPED_MATCH_FIELDS) delete out[k];
  if (m.country) {
    const { fifa_code: _fifa, ...country } = m.country as NonNullable<Match['country']> & { fifa_code?: unknown };
    out.country = country;
  }
  return stripUndefined(out) as unknown as Match;
}

/** Next props'unda `undefined` yasak; JSON turu yerine sığ+derin temizlik (daha az CPU). */
export function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

export function packHomeMatches(day: {
  fixtureMatches: Match[];
  liveMatches: Match[];
  historyMatches?: Match[];
  nightMatches?: Match[];
}): HomeInitialMatches {
  const leagues: PackedLeague[] = [];
  const leagueIndex = new Map<string, number>();
  const pack = (m: Match): PackedMatch => {
    const { competition, country, ...rest } = trimListMatch(m);
    const league = stripUndefined({ competition, country }) as PackedLeague;
    const key = JSON.stringify(league);
    let g = leagueIndex.get(key);
    if (g === undefined) {
      g = leagues.length;
      leagues.push(league);
      leagueIndex.set(key, g);
    }
    return { ...rest, g };
  };

  const fixtures = day.fixtureMatches.map(pack);
  const indexById = new Map<number, number>();
  day.fixtureMatches.forEach((m, i) => indexById.set(Number(m.id), i));
  const live = day.liveMatches.map((m) => {
    const packed = pack(m);
    const i = indexById.get(Number(m.id));
    // Aynı maç fikstürde de varsa ve içerik birebir aynıysa indeksle taşı; farklıysa (canlı listesi daha taze) nesneyle.
    if (i !== undefined && JSON.stringify(packed) === JSON.stringify(fixtures[i])) return i;
    return packed;
  });
  return {
    leagues,
    fixtures,
    live,
    ...(day.historyMatches ? { history: day.historyMatches.map(pack) } : {}),
    ...(day.nightMatches?.length ? { night: day.nightMatches.map(pack) } : {}),
  };
}

function unpackMatch(m: PackedMatch, leagues: PackedLeague[]): Match {
  const { g, ...rest } = m;
  return { ...rest, ...leagues[g] } as Match;
}

/** `useHomeHubMatches` verisinin şekli (bkz. hooks/useHomeHubMatches.ts `fetchHomeHubMatches`). */
export function unpackHomeMatches(packed: HomeInitialMatches): {
  allMatches: Match[];
  liveMatches: Match[];
  fixtureMatches: Match[];
  nightMatches: Match[];
} {
  const fixtureMatches = packed.fixtures.map((m) => unpackMatch(m, packed.leagues));
  const liveMatches = packed.live.map((x) => (typeof x === 'number' ? fixtureMatches[x]! : unpackMatch(x, packed.leagues)));
  const history = packed.history?.map((m) => unpackMatch(m, packed.leagues));
  const nightMatches = (packed.night ?? []).map((m) => unpackMatch(m, packed.leagues));
  return { allMatches: history ?? fixtureMatches, liveMatches, fixtureMatches, nightMatches };
}

