/**
 * "Hata = veri yok" deseni: puan durumu / gol krallığı / maç olayları / takım son maçları servisleri hatada FIRLATIR
 * (`fetch*`), `null`/boş yalnız gerçekten veri yokken; `get*` sarmalayıcıları sunucu kullanımları için hatayı yutar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sm = vi.hoisted(() => ({ request: vi.fn(), pages: vi.fn() }));
vi.mock('@/services/sportmonksRuntimeClient', async (orig) => ({
  ...(await orig<typeof import('@/services/sportmonksRuntimeClient')>()),
  sportmonksClientRequest: sm.request,
  sportmonksCollectAllPages: sm.pages,
}));

import { fetchCompetitionStandings, getCompetitionStandings } from './competitionStandings';
import { fetchTopScorersWithAppearances, getTopScorersWithAppearances } from './competitionTopScorers';
import { fetchMatchWithEvents, getMatchWithEvents } from './liveScoreService';
import { loadWithRetry } from '@/utils/loadWithRetry';

const upstream = () => Object.assign(new Error('Sportmonks 429'), { status: 429 });

beforeEach(() => {
  sm.request.mockReset();
  sm.pages.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('puan durumu', () => {
  it('sağlayıcı hatası: fetch fırlatır, get null', async () => {
    sm.pages.mockRejectedValue(upstream());
    await expect(fetchCompetitionStandings('600', { season: 1 })).rejects.toThrow('429');
    await expect(getCompetitionStandings('600', { season: 1 })).resolves.toBeNull();
  });

  it('sezon yok (gerçek boşluk): fetch null döner, fırlatmaz', async () => {
    sm.request.mockResolvedValue({ data: { id: 600, seasons: [] } });
    await expect(fetchCompetitionStandings('600')).resolves.toBeNull();
  });
});

describe('gol krallığı', () => {
  it('gol satırları alınamazsa fetch fırlatır, get null', async () => {
    sm.pages.mockRejectedValue(upstream());
    await expect(fetchTopScorersWithAppearances('600', { season: 1 })).rejects.toThrow('429');
    await expect(getTopScorersWithAppearances('600', { season: 1 })).resolves.toBeNull();
  });
});

describe('maç olayları', () => {
  it('fetchMatchWithEvents hatada fırlatır; getMatchWithEvents (canlı uç) boş döner', async () => {
    sm.request.mockRejectedValue(upstream());
    await expect(fetchMatchWithEvents('19732740')).rejects.toThrow();
    await expect(getMatchWithEvents('19732740')).resolves.toEqual({ match: null, events: [] });
  });
});

describe('loadWithRetry', () => {
  it('bir kez yeniden dener; ikinci başarı veriyi döner', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(null);
    await expect(loadWithRetry(fn, { delayMs: 0 })).resolves.toEqual({ data: null });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('denemeler tükenince { error: true } — null (veri yok) ile karışmaz', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await expect(loadWithRetry(fn, { delayMs: 0 })).resolves.toEqual({ error: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('iptal edildiyse yeniden denemez', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await expect(loadWithRetry(fn, { delayMs: 0, isCancelled: () => true })).resolves.toEqual({ error: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
