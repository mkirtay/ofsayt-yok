import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hakem sayfası Sportmonks istekleri (WEB-SPORTMONKS-2): tek `referees/{id}` + sabit sınırlı `fixtures/multi` parçaları.

const h = vi.hoisted(() => ({ calls: [] as { path: string; include?: string }[], fixtureRows: [] as { fixture_id: number; type_id: number }[] }));

vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_base: string, path: string, params?: { include?: string }) => {
    h.calls.push({ path, include: params?.include });
    if (path.startsWith('/referees/')) {
      return {
        data: {
          id: 62331,
          display_name: 'Hakem',
          country: { name: 'Turkey', iso2: 'TR' },
          statistics: [{ season_id: 1, season: { id: 1, name: '2026/2027', is_current: true }, details: [] }],
          fixtures: h.fixtureRows,
        },
      };
    }
    const ids = path.replace('/fixtures/multi/', '').split(',').map(Number);
    return {
      data: ids.map((id) => ({ id, state_id: 5, season_id: 1, starting_at: `2026-01-01 ${String(id % 24).padStart(2, '0')}:00:00`, participants: [], scores: [], events: [] })),
    };
  }),
}));
vi.mock('@/lib/redis', () => ({ withRedis: async (_fn: unknown, fallback: unknown) => fallback, fitsInRedis: () => true }));
vi.mock('@/server/swrCache', () => ({
  loadWithSwr: async (_key: string, _opts: unknown, compute: () => Promise<unknown>) => {
    const v = await compute();
    return v == null ? null : { value: v, state: 'computed' };
  },
  peekSwr: async () => null,
}));
vi.mock('@/server/backgroundTask', () => ({ runInBackground: () => {} }));

import { anchoredChunks, loadRefereePage, mainRefereeFixtureIds, REFEREE_PAGE_INCLUDE } from './refereePage';
import { REFEREE_STATS_INCLUDE } from '@/server/refereeSummary';
import { refereeTableSwrOptions } from './refereeLeagueTable';

const MAIN = 6;

beforeEach(() => {
  h.calls = [];
  h.fixtureRows = [];
});

describe('hakem sayfası: sabit sınırlı fixtures/multi parçaları', () => {
  it('parçalar en eski maçtan 20’lik; en yeni 8 parça, en yeni önce', () => {
    const ids = Array.from({ length: 205 }, (_, i) => i + 1);
    const chunks = anchoredChunks(ids, 20, 8);
    expect(chunks).toHaveLength(8);
    expect(chunks[0]).toEqual([201, 202, 203, 204, 205]);
    expect(chunks[1]![0]).toBe(181);
    expect(chunks[7]![0]).toBe(61);
  });

  it('yeni atama yalnız son parçayı değiştirir (önce 8 parçanın hepsi kayıyordu)', () => {
    const before = Array.from({ length: 150 }, (_, i) => 1000 + i * 3);
    const after = [...before, 99_999].sort((a, b) => a - b);
    const key = (c: number[]) => c.join(',');
    const a = anchoredChunks(before, 20, 8).map(key);
    const b = anchoredChunks(after, 20, 8).map(key);
    expect(b.filter((k) => !a.includes(k))).toHaveLength(1);
    // Sezon ortasındaki bir maça atama (id aradaki boşluğa düşer): yalnız ondan sonraki parçalar değişir.
    const mid = [...before, 1000 + 140 * 3 + 1].sort((x, y) => x - y);
    expect(anchoredChunks(mid, 20, 8).map(key).filter((k) => !a.includes(k)).length).toBeLessThanOrEqual(2);
  });

  it('yalnız orta hakemlik, tekil, eskiden yeniye', () => {
    expect(mainRefereeFixtureIds({ fixtures: [{ fixture_id: 5, type_id: MAIN }, { fixture_id: 3, type_id: MAIN }, { fixture_id: 4, type_id: 7 }, { fixture_id: 5, type_id: MAIN }] })).toEqual([3, 5]);
  });
});

describe('hakem sayfası: tek referees/{id} isteği', () => {
  it('profil + istatistik + maçlar tek istekte; son maçlar için yetecek kadar parça (12 biten maç → 1 multi)', async () => {
    h.fixtureRows = Array.from({ length: 32 }, (_, i) => ({ fixture_id: 100 + i, type_id: MAIN }));
    const data = await loadRefereePage(62331);
    expect(data && data !== 'missing' && data.recent).toHaveLength(10);
    const refCalls = h.calls.filter((c) => c.path.startsWith('/referees/'));
    expect(refCalls).toEqual([{ path: '/referees/62331', include: REFEREE_PAGE_INCLUDE }]);
    expect(REFEREE_PAGE_INCLUDE).toBe(`country;${REFEREE_STATS_INCLUDE};fixtures`);
    // Kırılım önbellekte yok → iki parçanın ikisi de (son parça 12, önceki 20) çekilir; her parça bir kez.
    const multi = h.calls.filter((c) => c.path.startsWith('/fixtures/multi/')).map((c) => c.path);
    expect(multi).toEqual(['/fixtures/multi/120,121,122,123,124,125,126,127,128,129,130,131', `/fixtures/multi/${Array.from({ length: 20 }, (_, i) => 100 + i).join(',')}`]);
  });
});

describe('/hakemler tablosu tazeliği', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  it('güncel sezon 12 sa; bitmiş eski sezon 30 gün taze / 60 gün saklama', () => {
    expect(refereeTableSwrOptions(true, '2027-05-30', now)).toEqual({ freshSeconds: 12 * 3600 });
    expect(refereeTableSwrOptions(false, '2026-05-30', now)).toEqual({ freshSeconds: 30 * 86400, keepSeconds: 60 * 86400 });
    expect(refereeTableSwrOptions(false, undefined, now)).toEqual({ freshSeconds: 30 * 86400, keepSeconds: 60 * 86400 });
    // Listede eski ama bitmemiş (takvim yılı / çakışan sezon) → güncel gibi.
    expect(refereeTableSwrOptions(false, '2026-12-20', now)).toEqual({ freshSeconds: 12 * 3600 });
  });
});
