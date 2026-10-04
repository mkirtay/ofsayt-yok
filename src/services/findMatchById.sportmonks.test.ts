import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import superLigFixture from './sportmonks/__fixtures__/superLigFixture.json';

/**
 * Sportmonks'ta maç çözümü yalnızca `fixtures/{id}` — eski liste taraması (5 gün × fixtures/date +
 * 11 lig × fixtures/between) yok; "yok" ile geçici hata ayrışır.
 */

const ORIGINAL_ENABLED = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;

function json(body: unknown, status = 200): () => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status });
}

describe('findMatchById / lookupSportmonksFixture (Sportmonks)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    process.env.SPORTMONKS_API_KEY = 'test-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_ENABLED === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL_ENABLED;
    if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
    else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
  });

  it('bulunan maç: tek istek, fixtures/{id} + events', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(json({ data: superLigFixture }));
    const { findMatchById } = await import('./liveScoreService');
    const id = String((superLigFixture as { id: number }).id);

    const r = await findMatchById(id);

    expect(r.match?.id).toBe(Number(id));
    expect(r.fromFixture).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain(`/fixtures/${id}?`);
    expect(decodeURIComponent(url)).toContain(';events');
  });

  it('yayıncılar yalnız başlamamış / canlı maçta, ayrı küçük istekle; sunucu Türkiye dışını ayıklar', async () => {
    const tvRows = [
      { tvstation_id: 878, country_id: 404, tvstation: { id: 878, name: 'TOD' } },
      { tvstation_id: 9, country_id: 462, tvstation: { id: 9, name: 'Sport TV' } },
    ];
    const base = { ...(superLigFixture as object), id: 19746594 } as Record<string, unknown>;
    const respond = (state: number) =>
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = decodeURIComponent(String(input));
        const body = url.includes('include=tvStations') ? { data: { id: 19746594, tvstations: tvRows } } : { data: { ...base, state_id: state, state: { id: state } } };
        return new Response(JSON.stringify(body), { status: 200 });
      });

    // Başlamamış (state 1): 2 istek, ana istekte yayıncı yok, ikinci istek yalnız yayıncılar; yalnız TR kanalı kalır.
    let spy = respond(1);
    let mod = await import('./liveScoreService');
    let r = await mod.lookupSportmonksFixture('19746594');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(spy.mock.calls[0]![0]))).not.toContain('tvStations');
    expect(decodeURIComponent(String(spy.mock.calls[1]![0]))).toContain('include=tvStations.tvStation:name');
    expect(r.kind === 'found' && r.match.tv_stations).toEqual(['TOD']);
    spy.mockRestore();

    // Bitmiş (state 5): tek istek, yayıncı istenmez.
    vi.resetModules();
    spy = respond(5);
    mod = await import('./liveScoreService');
    r = await mod.lookupSportmonksFixture('19746594');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.kind === 'found' && r.match.tv_stations).toBeUndefined();
  });

  it('bulunamayan maç: tek istek, liste taraması yok, kind=missing', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockImplementation(json({ message: 'No result(s) found matching your request.' }, 404));
    const { findMatchById, lookupSportmonksFixture } = await import('./liveScoreService');

    expect((await findMatchById('19999999')).match).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((await lookupSportmonksFixture('19999999')).kind).toBe('missing');
  });

  it('boş 200 cevabı da kalıcı "yok" sayılır', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(json({ message: 'No result(s) found' }));
    const { lookupSportmonksFixture } = await import('./liveScoreService');
    expect((await lookupSportmonksFixture('19999999')).kind).toBe('missing');
  });

  it('429/5xx geçici hata: kind=error (negatif cache\'lenmemeli)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(json({ message: 'Too Many Attempts.' }, 429));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { lookupSportmonksFixture } = await import('./liveScoreService');
    expect((await lookupSportmonksFixture('19999999')).kind).toBe('error');
  });

  it('zaman aşımı (sayfa bütçesi) geçici hata: kind=error — 410 / negatif cache yok', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { lookupSportmonksFixture } = await import('./liveScoreService');
    const { withSportmonksTimeout } = await import('@/server/sportmonks/cachedFetch');

    const r = await withSportmonksTimeout(30, () => lookupSportmonksFixture('19999998'));

    expect(r.kind).toBe('error');
    expect(fetchSpy.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });

  it('id aralığına bakmaz (eski UEFA fixture\'ları 1M civarında) — sayısal olmayan id\'ye istek atmaz', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(json({ data: { ...superLigFixture, id: 1058753 } }));
    const { lookupSportmonksFixture } = await import('./liveScoreService');

    expect((await lookupSportmonksFixture('1058753')).kind).toBe('found');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((await lookupSportmonksFixture('abc')).kind).toBe('missing');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
