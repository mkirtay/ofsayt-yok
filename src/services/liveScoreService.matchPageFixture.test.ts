import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkProxyAllowlist } from '@/server/sportmonks/proxyAllowlist';
import { detailFromFind } from '@/hooks/useMatchDetail';
import type { Match } from '@/models/liveScore';
import celtaVigoFixture from './sportmonks/__fixtures__/celtaVigoFixture.json';

// Maç sayfasının TEK `fixtures/{id}` isteği (WEB-SPORTMONKS-2): SSR, istemci, canlı yedek, kadro yoklaması ve AI bağlamı
// aynı önbellek anahtarını kullanır; ayrı `statistics` / kadro / yayıncı isteği yok.

vi.mock('@/hooks/useLiveMatchUpdates', () => ({ useLiveMatchUpdates: () => {} }));

async function withServer<T>(fn: () => Promise<T>): Promise<T> {
  process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
  process.env.SPORTMONKS_API_KEY = 'test-token';
  vi.resetModules();
  return fn();
}

afterEach(() => {
  vi.restoreAllMocks();
});

const respond = (data: unknown) =>
  vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data }), { status: 200 }));

describe('maç sayfası tek fixtures/{id} isteği', () => {
  it('lookup / getMatchWithEvents / getMatchStats / getMatchLineups aynı URL’e gider', async () => {
    await withServer(async () => {
      const spy = respond({ ...(celtaVigoFixture as object), statistics: [], lineups: [] });
      const mod = await import('./liveScoreService');
      await mod.lookupSportmonksFixture('19732740');
      await mod.getMatchWithEvents('19732740');
      await mod.getMatchStats('19732740');
      await mod.getMatchLineups('19732740');
      const urls = new Set(spy.mock.calls.map((c) => String(c[0]).replace(/api_token=[^&]*/, '')));
      expect(urls.size).toBe(1);
      const url = decodeURIComponent([...urls][0]!);
      expect(url).toContain(`include=${mod.MATCH_PAGE_INCLUDE}`);
      expect(url).toContain(`filters=${mod.MATCH_PAGE_FILTERS}`);
    });
  });

  it('lookup aynı yanıttan istatistik ve kadroyu da döndürür (null = veri yok)', async () => {
    await withServer(async () => {
      respond({ ...(celtaVigoFixture as object), statistics: [], lineups: [] });
      const mod = await import('./liveScoreService');
      const r = await mod.lookupSportmonksFixture('19732740');
      expect(r.kind).toBe('found');
      if (r.kind !== 'found') return;
      expect(r.stats).toBeNull();
      expect(r.lineups).toBeDefined();
      const found = await mod.findMatchById('19732740');
      expect(found.stats).toBeNull();
      expect('lineups' in found).toBe(true);
    });
  });

  it('tarayıcı proxy izin listesi birleşik include’u ve iki metadata türlü süzgeci kabul eder (≤ 25 öğe)', async () => {
    const { MATCH_PAGE_INCLUDE, MATCH_PAGE_FILTERS } = await import('./liveScoreService');
    expect(MATCH_PAGE_INCLUDE.split(';').length).toBeLessThanOrEqual(25);
    expect(MATCH_PAGE_FILTERS).toBe('metadataTypes:572,613');
    const r = checkProxyAllowlist('football/fixtures/19746609', { include: MATCH_PAGE_INCLUDE, filters: MATCH_PAGE_FILTERS });
    expect(r.violations).toEqual([]);
    expect(r.allowed).toBe(true);
  });
});

describe('istemci: maç aramasının getirdiği istatistik / kadro', () => {
  const match = { id: 1 } as unknown as Match;
  it('arama yanıtında varsa kullanılır (ayrı istek yok), yoksa / maç yoksa ayrıca istenir', () => {
    expect(detailFromFind({ match, events: [], fromFixture: false, stats: null, lineups: null })).toEqual({ stats: null, lineups: null });
    expect(detailFromFind({ match, events: [], fromFixture: false })).toEqual({});
    expect(detailFromFind({ match: null, events: [], fromFixture: false, stats: null })).toEqual({});
  });
});
