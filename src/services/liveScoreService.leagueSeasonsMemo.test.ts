import { afterEach, describe, expect, it, vi } from 'vitest';
import seasonsLaLiga from './sportmonks/__fixtures__/seasonsLaLiga.json';

/**
 * Tarayıcıda `leagues/{id}?include=seasons` tek kayıt: sezon listesi + güncel sezon çözümü (puan durumu)
 * aynı anda istense de proxy'ye TEK istek gider (ana sayfa önceden aynı isteği 3 kez atıyordu).
 */
const ORIGINAL_ENABLED = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;

afterEach(() => {
  if (ORIGINAL_ENABLED === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL_ENABLED;
  vi.unstubAllGlobals();
  vi.resetModules();
});

function leagueSeasonsResponse() {
  return new Response(
    JSON.stringify({ data: { id: 564, seasons: seasonsLaLiga }, rate_limit: { resets_in_seconds: 100, remaining: 2400, requested_entity: 'League' } }),
    { status: 200 },
  );
}

describe('league-seasons tek kayıt (tarayıcı)', () => {
  it('paralel getSeasonsList + getCompetitionTableFull → leagues/{id} yalnızca 1 kez', async () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    vi.stubGlobal('window', {});
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/leagues/')) return leagueSeasonsResponse();
        // Puan durumu: boş tablo yeterli (bu test yalnızca sezon isteğini sayar).
        return new Response(JSON.stringify({ data: [], pagination: { has_more: false } }), { status: 200 });
      }),
    );
    const svc = await import('./liveScoreService');
    svc.__resetLeagueSeasonsMemoForTests();

    await Promise.all([
      svc.getSeasonsList({ competitionId: 564 }),
      svc.getCompetitionTableFull('564'),
      svc.getSeasonsList({ competitionId: 564 }),
    ]);
    expect(calls.filter((u) => u.includes('/leagues/564')).length).toBe(1);
    expect(calls.every((u) => u.startsWith('/api/sportmonks/'))).toBe(true);
  });

  it('hata cache\'lenmez: sonraki çağrı yeniden dener', async () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    vi.stubGlobal('window', {});
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1;
        return n === 1 ? new Response('{}', { status: 500 }) : leagueSeasonsResponse();
      }),
    );
    const svc = await import('./liveScoreService');
    svc.__resetLeagueSeasonsMemoForTests();

    expect(await svc.getSeasonsList({ competitionId: 564 })).toEqual([]);
    const second = await svc.getSeasonsList({ competitionId: 564 });
    expect(second.length).toBeGreaterThan(0);
    expect(n).toBe(2);
  });
});
