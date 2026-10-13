/**
 * Karşılaşma geçmişi: hata ≠ veri yok. Servis hatada fırlatır (null yalnız gerçekten boş); panel bir kez yeniden dener,
 * yine olmazsa "yüklenemedi" + Tekrar dene; boşta "geçmiş yok"; başarıda tablo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const sm = vi.hoisted(() => ({
  request: vi.fn(),
  pages: vi.fn(),
}));
vi.mock('@/services/sportmonksRuntimeClient', async (orig) => ({
  ...(await orig<typeof import('@/services/sportmonksRuntimeClient')>()),
  sportmonksClientRequest: sm.request,
  sportmonksCollectAllPages: sm.pages,
}));

import MatchCard, { H2hError, H2hNone, loadH2hWithRetry } from '@/components/MatchCard';
import { getTeamsHead2Head, type Head2HeadData } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import trState from '../../../public/locales/tr/matchState.json';
import enState from '../../../public/locales/en/matchState.json';

const DATA = {
  team1: { id: '34', name: 'Galatasaray', overall_form: ['W'], h2h_form: ['L'] },
  team2: { id: '83', name: 'FC Barcelona', overall_form: ['W'], h2h_form: ['W'] },
  h2h: [{ id: '10', date: '2023-02-16', scheduled: '20:00', home_name: 'Galatasaray', away_name: 'FC Barcelona', score: '1-2', ht_score: '0-1', status: 'FINISHED' }],
} as unknown as Head2HeadData;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sm.request.mockReset();
  sm.pages.mockReset();
});

describe('getTeamsHead2Head sözleşmesi', () => {
  it('Sportmonks hatası / 504 zaman aşımı → FIRLATIR (null "geçmiş yok" sanılmasın)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sm.request.mockRejectedValueOnce(new Error('Sportmonks zaman aşımı (504)'));
    await expect(getTeamsHead2Head('34', '83')).rejects.toThrow(/504/);
  });

  it('form isteği (takım maçları) hatası da fırlatır', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sm.request.mockResolvedValueOnce({ data: [{ id: 10, participants: [] }] });
    sm.pages.mockRejectedValue(new Error('502'));
    await expect(getTeamsHead2Head('34', '83')).rejects.toThrow();
  });

  it('gerçekten boş sonuç (H2H yok, iki takımın da son maçı yok) → null', async () => {
    sm.request.mockResolvedValueOnce({ data: [] });
    sm.pages.mockResolvedValue([]);
    expect(await getTeamsHead2Head('34', '83')).toBeNull();
  });

  it('H2H yok ama son maçlar var → form dolu, h2h boş liste (Son 5 Maç kaybolmaz)', async () => {
    sm.request.mockResolvedValueOnce({ data: [] });
    // Gerçek Sportmonks örneği (Barcelona 83 – Real Madrid 3468 maçları) iki takımın "son maçları" olarak.
    const sample = (await import('@/services/sportmonks/__fixtures__/headToHeadBarcaMadrid.json')).default as { data?: unknown[] } | unknown[];
    const fixtures = Array.isArray(sample) ? sample : (sample.data ?? []);
    sm.pages.mockResolvedValue(fixtures);
    const d = await getTeamsHead2Head('83', '3468');
    expect(d).not.toBeNull();
    expect(d!.h2h).toEqual([]);
    expect(d!.team1.overall_form?.length ?? 0).toBeGreaterThan(0);
    expect(d!.team2.overall_form?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('loadH2hWithRetry (panel)', () => {
  it('hata → bir kez bekleyip yeniden dener; ikinci deneme başarılıysa veri', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('504')).mockResolvedValueOnce(DATA);
    const p = loadH2hWithRetry(fetcher, { delayMs: 1500 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toEqual({ data: DATA });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('iki deneme de hata → { error: true } (veri yok DEĞİL)', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValue(new Error('504'));
    const p = loadH2hWithRetry(fetcher, { delayMs: 1500 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toEqual({ error: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('boş → { data: null }, yeniden deneme yok', async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    expect(await loadH2hWithRetry(fetcher)).toEqual({ data: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('beklerken iptal edilirse ikinci istek atılmaz', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const fetcher = vi.fn().mockRejectedValue(new Error('504'));
    const p = loadH2hWithRetry(fetcher, { delayMs: 1500, isCancelled: () => cancelled });
    await Promise.resolve();
    cancelled = true;
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('görünüm: hata ⇒ yüklenemedi, boş ⇒ geçmiş yok, başarı ⇒ tablo', () => {
  it('hata: "yüklenemedi" + Tekrar dene düğmesi (TR/EN metinleri)', () => {
    const html = renderToStaticMarkup(<H2hError message={trState.h2h.loadError} retryLabel={trState.h2h.retry} onRetry={() => {}} />);
    expect(html).toContain('Karşılaşma geçmişi yüklenemedi.');
    expect(html).toMatch(/<button[^>]*>Tekrar dene<\/button>/);
    expect(html).not.toContain(trState.h2h.none);
    expect([enState.h2h.loadError, enState.h2h.retry]).toEqual(["Couldn't load the head-to-head.", 'Try again']);
  });

  it('boş: mevcut "geçmiş yok" metni', () => {
    const html = renderToStaticMarkup(<H2hNone message={trState.h2h.none} />);
    expect(html).toContain('Bu iki takımın karşılaşma geçmişi yok.');
  });

  it('form var, karşılaşma geçmişi yok: Son 5 Maç + "geçmiş yok" notu, tablo yok', () => {
    const match = { id: 19872635, status: 'NOT STARTED', time: '', date: '2026-10-13', scheduled: '22:00', home: { id: 19, name: 'Arsenal' }, away: { id: 690, name: 'LOSC Lille' } } as Match;
    const formOnly = {
      team1: { id: '19', name: 'Arsenal', overall_form: ['W', 'D', 'W'], h2h_form: [] },
      team2: { id: '690', name: 'LOSC Lille', overall_form: ['L', 'W'], h2h_form: [] },
      h2h: [],
    } as unknown as Head2HeadData;
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchCard match={match} initialH2h={formOnly} />
      </QueryClientProvider>,
    );
    expect(html).toMatch(/formPill/);
    expect(html).toContain('data-testid="h2h-none"');
    expect(html).toContain('Bu iki takımın karşılaşma geçmişi yok.');
    expect(html).not.toMatch(/h2hTableWrap/);
  });

  it('başarı: karşılaşma tablosu', () => {
    const match = { id: 19872596, status: 'NOT STARTED', time: '', date: '2026-10-13', scheduled: '19:00', home: { id: 34, name: 'Galatasaray' }, away: { id: 83, name: 'FC Barcelona' } } as Match;
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchCard match={match} initialH2h={DATA} />
      </QueryClientProvider>,
    );
    expect(html).toContain('1-2');
    expect(html).not.toContain('h2h-error');
  });
});
