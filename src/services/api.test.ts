import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveScoreApi } from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('liveScoreApi (tarayıcı, fetch)', () => {
  it('parametreleri sorguya ekler, boş olanları atlar; gövde `data`da döner', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: { x: 1 } }), { status: 200 }));

    const res = await liveScoreApi.get('/competitions/table', {
      params: { competition_id: 6, group_id: undefined, season_id: null, q: 'a b' },
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/livescore/competitions/table?competition_id=6&q=a+b');
    expect(res.data).toEqual({ success: true, data: { x: 1 } });
  });

  it('2xx dışında hata fırlatır (axios gibi)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 502 }));
    await expect(liveScoreApi.get('/matches/live')).rejects.toThrow('502');
  });
});
