import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';

const request = vi.fn();
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: (...a: unknown[]) => request(...a) }));

import { fetchTeamTransferRows } from './teamTransfers';

const page = (ids: number[], hasMore: boolean) => ({ data: ids.map((id) => ({ id })), pagination: { has_more: hasMore } });

describe('fetchTeamTransferRows', () => {
  beforeEach(() => request.mockReset());

  it('en çok 2 sayfa; 2. sayfa page=2 ile', async () => {
    request.mockResolvedValueOnce(page([1, 2], true)).mockResolvedValueOnce(page([3], true));
    expect((await fetchTeamTransferRows(34)).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]![1]).toBe('/transfers/teams/34');
    expect(request.mock.calls[1]![2]).toMatchObject({ page: '2', per_page: '50' });
  });

  it('has_more yoksa tek istek', async () => {
    request.mockResolvedValueOnce(page([1], false));
    await fetchTeamTransferRows(34);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('1. sayfa geçici hatası FIRLAR (hata ≠ veri yok); 404 → boş; 2. sayfa hatası → 1. sayfayla devam', async () => {
    request.mockRejectedValueOnce(new SportmonksHttpError('x', 429, null));
    await expect(fetchTeamTransferRows(34)).rejects.toBeInstanceOf(SportmonksHttpError);
    request.mockRejectedValueOnce(new SportmonksHttpError('x', 404, null));
    expect(await fetchTeamTransferRows(34)).toEqual([]);
    request.mockResolvedValueOnce(page([1], true)).mockRejectedValueOnce(new Error('timeout'));
    expect((await fetchTeamTransferRows(34)).map((r) => r.id)).toEqual([1]);
  });
});
