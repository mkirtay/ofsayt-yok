/**
 * Kombine aracı: API-Football eşleme + oran katmanı (YALNIZ sunucu, yalnız admin aracı çağırır).
 * - Gün fikstürü: günde TEK `fixtures?date=` isteği, ham ~1 MB yerine sadeleştirilmiş [id, saat, takımlar] önbelleğe girer.
 * - Oran: `odds?fixture=` yalnız kullanıcının seçtiği maçlar için (tüm maçlar için çekilmez), kısa süre önbellekli.
 * - Bütçe: milli maç sayacından AYRI `combo` havuzu (client.ts COMBO_DAILY_LIMIT).
 * Eşleşmeyen maçta oran gösterilmez.
 */
import { toAfId } from '@/services/apiFootball/ids';
import { apiFootballGet } from '@/server/apiFootball/client';
import { afCached } from '@/server/apiFootball/cache';
import type { AfFixture } from '@/services/apiFootball/types';
import { matchFixture, type AfFixtureSlim } from '@/services/apiFootball/fixtureMatch';
import { comboMarketOdds, marketOdd, type AfOddsEntry, type ComboMarketOdds, type MarketKey, type MarketOdd } from '@/services/apiFootball/oddsMarkets';
import type { ComboMarketKey } from '@/utils/comboMarkets';

/** Maçın kombine pazarlarının piyasa olasılığı + referans oranı (aynı AF yanıtından, ek istek yok). */
export type ComboMarketsOdds = Partial<Record<ComboMarketKey, ComboMarketOdds>>;

type Get = typeof apiFootballGet;

/** AF dakika başı sınırı aşıldığında (yanıt gövdesinde `rateLimit`) 2 sn bekleyip BİR kez yeniden dener. */
export function withRateLimitRetry(get: Get, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Get {
  return (async (path, params, fetchImpl) => {
    try {
      return await get(path, params, fetchImpl);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('rateLimit')) throw error;
      await sleep(2000);
      return get(path, params, fetchImpl);
    }
  }) as Get;
}

const comboGet: Get = withRateLimitRetry((path, params, fetchImpl) => apiFootballGet(path, params, fetchImpl, 'combo'));

/** Gün fikstürü (UTC günü) → sade liste; AF hatasında null (boş listeyle karışmaz). Taze: 3 sa (saat kayması nadir). */
export async function loadAfFixturesSlim(utcDate: string, get: Get = comboGet): Promise<AfFixtureSlim[] | null> {
  const r = await afCached<AfFixtureSlim[]>(`combo:fx:${utcDate}`, 3 * 3600, async () => {
    const body = await get<AfFixture>('/fixtures', {
      date: utcDate,
      timezone: 'UTC',
    });
    return (body.response ?? []).map((f) => ({
      id: f.fixture.id,
      ts: Math.floor(Date.parse(f.fixture.date) / 1000),
      home: f.teams.home.name,
      away: f.teams.away.name,
      leagueId: f.league.id,
    }));
  });
  return r.ok ? r.value : null;
}

/** Bir maçın oran kaydı; oran açılmamışsa `entry: null`. AF hatasında `ok: false`. Taze: 15 dk (oran kapanışa kadar oynar). */
export async function loadAfOdds(
  afFixtureId: number,
  get: Get = comboGet,
): Promise<{ ok: true; entry: AfOddsEntry | null } | { ok: false }> {
  const r = await afCached<AfOddsEntry | null>(`combo:odds:${afFixtureId}`, 15 * 60, async () => {
    const body = await get<AfOddsEntry>('/odds', { fixture: afFixtureId });
    return body.response?.[0] ?? null;
  });
  return r.ok ? { ok: true, entry: r.value } : { ok: false };
}

export type OddsRequest = {
  matchId: string;
  key: MarketKey;
  kickoffMs: number | null;
  home: string;
  away: string;
};

export type OddsResult =
  | {
      matchId: string;
      status: 'ok';
      afFixtureId: number;
      market: MarketOdd;
      markets: ComboMarketsOdds;
      updatedAt: string | null;
    }
  | {
      matchId: string;
      status: 'no-fixture' | 'no-odds' | 'no-market' | 'error';
      afFixtureId?: number;
      /** `no-market`: istenen pazar yok ama kombine pazarları olabilir. */
      markets?: ComboMarketsOdds;
    };

export type OddsDeps = {
  fixtures: (utcDate: string) => Promise<AfFixtureSlim[] | null>;
  odds: (afFixtureId: number) => Promise<{ ok: true; entry: AfOddsEntry | null } | { ok: false }>;
};

/** AF dakika başı sınırına çarpmamak için eşzamanlı oran isteği sayısı (25 paralel istekte bir kısmı hata döndü). */
const ODDS_CONCURRENCY = 4;

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const defaultDeps: OddsDeps = {
  fixtures: (d) => loadAfFixturesSlim(d),
  odds: (id) => loadAfOdds(id),
};

/** Seçilen maçların oranı: eşle → oran çek → pazarı çıkar. Her maç bağımsız; biri hata verse diğerleri döner. */
export async function resolveOdds(requests: readonly OddsRequest[], deps: OddsDeps = defaultDeps): Promise<OddsResult[]> {
  // Maçın UTC günü (AF `fixtures?date` UTC gününe göre); günler tekil → istek sayısı ≤ 2.
  const dates = new Set<string>();
  for (const r of requests) {
    if (r.kickoffMs != null && toAfId(r.matchId) == null) dates.add(new Date(r.kickoffMs).toISOString().slice(0, 10));
  }
  const byDate = new Map<string, AfFixtureSlim[] | null>();
  await Promise.all([...dates].map(async (d) => byDate.set(d, await deps.fixtures(d))));

  const fromEntry = async (r: OddsRequest, afId: number): Promise<OddsResult> => {
    const o = await deps.odds(afId);
    if (!o.ok) return { matchId: r.matchId, status: 'error', afFixtureId: afId };
    if (!o.entry || o.entry.bookmakers.length === 0) return { matchId: r.matchId, status: 'no-odds', afFixtureId: afId };
    const market = marketOdd(o.entry, r.key);
    const markets = comboMarketOdds(o.entry);
    if (!market) return { matchId: r.matchId, status: 'no-market', afFixtureId: afId, markets };
    return { matchId: r.matchId, status: 'ok', afFixtureId: afId, market, markets, updatedAt: o.entry.update ?? null };
  };

  return mapLimit(requests, ODDS_CONCURRENCY, async (r): Promise<OddsResult> => {
    // Milli maç: uygulama kimliği zaten AF kimliği (+2e9) → eşleme / fikstür listesi gerekmez.
    const directAf = toAfId(r.matchId);
    if (directAf != null) return fromEntry(r, directAf);
    if (r.kickoffMs == null) return { matchId: r.matchId, status: 'no-fixture' };
    const list = byDate.get(new Date(r.kickoffMs).toISOString().slice(0, 10));
    if (list == null) return { matchId: r.matchId, status: 'error' };
    const matched = matchFixture({ kickoffMs: r.kickoffMs, home: r.home, away: r.away }, list);
    if (!matched) return { matchId: r.matchId, status: 'no-fixture' };
    return fromEntry(r, matched.fixture.id);
  });
}
