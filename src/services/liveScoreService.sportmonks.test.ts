import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import inplayFixture from './sportmonks/__fixtures__/inplayFixture.json';
import superLigFixture from './sportmonks/__fixtures__/superLigFixture.json';

/**
 * `liveScoreService.ts`'teki 5 Katman-1 fonksiyonunun (docs/SPORTMONKS_MIGRATION.md
 * Pass 1) `NEXT_PUBLIC_SPORTMONKS_ENABLED` bayrağına göre doğru koda dallandığını
 * doğrular. Gerçek ağ isteği YOK — `global.fetch` mock'lanıyor, gövdeler
 * `__fixtures__/inplayFixture.json` (Pass 1'den gerçek bir fixture) üzerine kurulu
 * Sportmonks envelope şekliyle (`{data, pagination}`) sarmalanıyor.
 */

const ORIGINAL_ENABLED = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;

function restoreEnv() {
  if (ORIGINAL_ENABLED === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL_ENABLED;
  if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
  else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
}

function mockEnvelopeResponse(data: unknown): () => Promise<Response> {
  // Her çağrıda TAZE bir Response — `fetch` gerçek hayatta her istekte yeni bir
  // Response döner, aynı gövde iki kez okunamaz (chunking birden fazla istek atabilir).
  return async () =>
    new Response(
      JSON.stringify({
        data,
        pagination: { count: 1, per_page: 50, has_more: false, current_page: 1 },
        rate_limit: { resets_in_seconds: 2678, remaining: 2474, requested_entity: 'Fixture' },
      }),
      { status: 200 },
    );
}

describe('liveScoreService — Sportmonks Faz 2 wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    process.env.SPORTMONKS_API_KEY = 'test-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('getAllLiveMatches: flag açıkken /livescores/inplay çağırır ve Match[] döner', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([inplayFixture]));
    const { getAllLiveMatches } = await import('./liveScoreService');

    const matches = await getAllLiveMatches();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/livescores/inplay');
    expect(calledUrl).toContain('api_token=test-token');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(19874789);
    expect(matches[0].fixture_id).toBeUndefined();
  });

  it('getFixturesByDate: flag açıkken /fixtures/date/{date} çağırır', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([inplayFixture]));
    const { getFixturesByDate } = await import('./liveScoreService');

    const matches = await getFixturesByDate('2026-09-17');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0] as string).toContain('/fixtures/date/2026-09-17');
    expect(matches[0].id).toBe(19874789);
  });

  it('getFixturesByCompetition: doğrulanmış id (244 → Sportmonks 2) için filters=fixtureLeagues:2 ile /fixtures/between çağırır', async () => {
    const fixtureInLeague2 = { ...inplayFixture, league_id: 2 };
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([fixtureInLeague2]));
    const { getFixturesByCompetition } = await import('./liveScoreService');

    const matches = await getFixturesByCompetition(244);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/fixtures/between/');
    expect(calledUrl).toContain('filters=fixtureLeagues%3A2');
    expect(matches).toHaveLength(1);
  });

  it('getFixturesByCompetition: eşlemesi olmayan bir id için ağ isteği atmadan boş dizi döner', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([]));
    const { getFixturesByCompetition } = await import('./liveScoreService');

    const matches = await getFixturesByCompetition(362); // WORLD_CUP_COMPETITION_ID — eşlemesiz

    expect(matches).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getFixturesByCompetition: filters sessizce uygulanmazsa (Pass 5 risk kategorisi) beklenmeyen ligi süzer', async () => {
    const wrongLeagueFixture = { ...inplayFixture, league_id: 999 }; // filtre uygulanmamış gibi davran
    vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([wrongLeagueFixture]));
    const { getFixturesByCompetition } = await import('./liveScoreService');

    const matches = await getFixturesByCompetition(244);

    expect(matches).toEqual([]);
  });

  it('getFixturesByCompetition: Trendyol Süper Lig (6 → Sportmonks 600) gerçek fixture ile doğru map\'lenir', async () => {
    // 2026-09-18 doğrulama turu: sportmonksProviderFlag.ts'teki 6→600 eşlemesi +
    // gerçek fixture 19746621 (Fenerbahçe-Beşiktaş, league_id:600) — sadece HTTP
    // 200 değil, dönen id'nin gerçekten Süper Lig maçı olduğu da doğrulanıyor.
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([superLigFixture]));
    const { getFixturesByCompetition } = await import('./liveScoreService');

    const matches = await getFixturesByCompetition(6); // TURKEY_COMPETITION_IDS[0]

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0] as string).toContain('filters=fixtureLeagues%3A600');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(19746621);
    expect(matches[0].home).toEqual(expect.objectContaining({ id: 88, name: 'Fenerbahçe' }));
    expect(matches[0].away).toEqual(expect.objectContaining({ id: 554, name: 'Beşiktaş' }));
    expect(matches[0].competition?.id).toBe(600);
    expect(matches[0].country?.name).toBe('Turkey');
  });

  it('getFixturesByCompetition: Süper Lig sonucuna başka bir lig karışırsa (sessiz filtre hatası) o parça elenir', async () => {
    // filterAssertion.ts'in checkFilteredResult'ı — filtre GERÇEKTEN uygulanmış
    // (superLigFixture league_id:600) ama araya league_id:999 gibi beklenmeyen bir
    // satır karışırsa (Pass 5 "sessiz filtre hatası" senaryosu), tüm sonuç atılır.
    const contaminated = [superLigFixture, { ...inplayFixture, league_id: 999 }];
    vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse(contaminated));
    const { getFixturesByCompetition } = await import('./liveScoreService');

    const matches = await getFixturesByCompetition(6);

    expect(matches).toEqual([]);
  });

  it('getAllMatchesByDate: flag açıkken from=to=date ile /fixtures/between çağırır (filtresiz)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([inplayFixture]));
    const { getAllMatchesByDate } = await import('./liveScoreService');

    const matches = await getAllMatchesByDate('2026-09-17');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/fixtures/between/2026-09-17/2026-09-17');
    expect(calledUrl).not.toContain('filters=');
    expect(matches).toHaveLength(1);
  });

  it('getAllCompetitionHistoryMatches: doğrulanmış id için geriye dönük varsayılan pencereyle /fixtures/between çağırır', async () => {
    const fixtureInLeague2 = { ...inplayFixture, league_id: 2 };
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([fixtureInLeague2]));
    const { getAllCompetitionHistoryMatches } = await import('./liveScoreService');

    const matches = await getAllCompetitionHistoryMatches('244');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0] as string).toContain('filters=fixtureLeagues%3A2');
    expect(matches).toHaveLength(1);
  });

  it('getAllCompetitionHistoryMatches: filters sessizce uygulanmazsa (Pass 5 risk kategorisi) beklenmeyen ligi süzer', async () => {
    // Faz 4 madde 5: getFixturesByCompetition'ın zaten sahip olduğu silent-filter
    // testinin getAllCompetitionHistoryMatches için de AYRICA doğrulanmış hali —
    // ikisi aynı `sportmonksFetchFixturesBetween` primitifini paylaşıyor ama
    // dışa açık iki ayrı fonksiyon, ikisi de bağımsız test edilmeli.
    const wrongLeagueFixture = { ...inplayFixture, league_id: 999 };
    const { getAllCompetitionHistoryMatches } = await import('./liveScoreService');
    vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([wrongLeagueFixture]));

    const matches = await getAllCompetitionHistoryMatches('244');

    expect(matches).toEqual([]);
  });

  it('flag KAPALIYKEN Sportmonks fetch hiç çağrılmaz — legacy (livescore-api.com) kod yolu korunur', async () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'false';
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(mockEnvelopeResponse([inplayFixture]));
    const { getFixturesByDate, getAllLiveMatches } = await import('./liveScoreService');

    await getFixturesByDate('2026-09-17').catch(() => {});
    await getAllLiveMatches().catch(() => {});

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
