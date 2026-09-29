import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookup = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/sportmonksProviderFlag', () => ({ isSportmonksProviderEnabled: () => true }));
vi.mock('@/services/liveScoreService', () => ({
  lookupSportmonksFixture: lookup,
  findMatchById: vi.fn(),
  findMatchByTeamIds: vi.fn(),
  getMatchWithEvents: vi.fn(),
}));

import { resolveLiveMatch, resolveSportmonksMatch } from './resolveLiveMatch';
import { findMatchByTeamIds, getMatchWithEvents } from '@/services/liveScoreService';

describe('resolveSportmonksMatch / resolveLiveMatch (Sportmonks)', () => {
  beforeEach(() => lookup.mockReset());

  it('"yok" cevabı negatif cache\'lenir: aynı id ikinci kez upstream\'e gitmez', async () => {
    lookup.mockResolvedValue({ kind: 'missing' });
    expect((await resolveSportmonksMatch('19000001')).kind).toBe('missing');
    expect((await resolveSportmonksMatch('19000001')).kind).toBe('missing');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('belirsiz bölgedeki id varsayılan olarak legacy: istek yok (analiz/trivia/değerlendirme bağlamı)', async () => {
    expect((await resolveSportmonksMatch('1825339')).kind).toBe('legacy');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('geçici hata cache\'lenmez', async () => {
    lookup.mockResolvedValue({ kind: 'error' });
    await resolveSportmonksMatch('19000002');
    await resolveSportmonksMatch('19000002');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('bulunan maç: olaylar tek istekten gelir, ikinci events isteği ve takım geçmişi taraması yok', async () => {
    const match = { id: 19000003, status: 'NOT STARTED', home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } };
    lookup.mockResolvedValue({ kind: 'found', match, events: [] });

    const r = await resolveLiveMatch('19000003');

    expect(r?.match).toBe(match);
    expect(r?.apiMatchId).toBe('19000003');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(getMatchWithEvents).not.toHaveBeenCalled();
    expect(findMatchByTeamIds).not.toHaveBeenCalled();
  });

  it('bulunamayan maç: null, takım geçmişi taraması yok', async () => {
    lookup.mockResolvedValue({ kind: 'missing' });
    expect(await resolveLiveMatch('19000004')).toBeNull();
    expect(findMatchByTeamIds).not.toHaveBeenCalled();
  });
});
