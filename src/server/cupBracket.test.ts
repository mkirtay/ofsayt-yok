import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cupStagesTtl, sportmonksCacheTtl } from '@/services/sportmonks/cachePolicy';
import uclSeason2526 from '@/services/cupBracket/__fixtures__/uclSeason2526.json';
import turkishCupSeason2627 from '@/services/cupBracket/__fixtures__/turkishCupSeason2627.json';

const h = vi.hoisted(() => ({ calls: [] as { path: string; params: unknown }[], stages: [] as unknown[], fail: false }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_base: string, path: string, params: unknown) => {
    h.calls.push({ path, params });
    if (h.fail) throw new Error('Sportmonks 429');
    if (path.startsWith('/leagues/')) return { data: { id: 2, seasons: [{ id: 25580, is_current: false }, { id: 28155, is_current: true }] } };
    return { data: h.stages };
  }),
}));

import { CUP_STAGES_FILTERS, CUP_STAGES_INCLUDE, loadCupBracket } from './cupBracket';

const MIN = 60;
const HOUR = 3600;
const DAY = 86_400;
const NOW = Date.parse('2026-10-21T12:00:00Z');
const fx = (startingAt: string, stateId: number) => ({ id: 1, state_id: stateId, starting_at: startingAt });
const ko = (fixtures: unknown[], name = '3rd Round') => [{ id: 1, type_id: 224, name, fixtures }];

describe('eleme ağacı önbellek süresi (stages/seasons + fixtures)', () => {
  it('Final 1 günden önce bittiyse sezon bitti → 30 gün', () => {
    expect(cupStagesTtl(uclSeason2526.data, NOW)).toEqual({ fresh: 30 * DAY, stale: 30 * DAY });
  });

  it('canlı eleme maçı → 5 dk (30 sn değil)', () => {
    expect(cupStagesTtl(ko([fx('2026-10-21 11:30:00', 2)]), NOW).fresh).toBe(5 * MIN);
  });

  it('eleme günü: sıradaki başlamaya kadar, en çok 1 sa', () => {
    expect(cupStagesTtl(ko([fx('2026-10-21 20:00:00', 1)]), NOW).fresh).toBe(HOUR);
    expect(cupStagesTtl(ko([fx('2026-10-21 12:30:00', 1)]), NOW).fresh).toBe(15 * MIN);
  });

  it('maçsız gün en çok 12 sa; lig aşaması maçları süreyi kısaltmaz', () => {
    const stages = [...ko([fx('2026-10-27 15:00:00', 1)]), { id: 2, type_id: 223, name: 'League Stage', fixtures: [fx('2026-10-21 11:30:00', 2)] }];
    expect(cupStagesTtl(stages, NOW)).toEqual({ fresh: 12 * HOUR, stale: 7 * DAY });
  });

  it('cachePolicy yalnız fixtures include’lu stages/seasons isteğine uygular', () => {
    const data = turkishCupSeason2627.data;
    expect(sportmonksCacheTtl('football/stages/seasons/28283', data, NOW, { include: CUP_STAGES_INCLUDE }).fresh).toBe(cupStagesTtl(data, NOW).fresh);
    expect(sportmonksCacheTtl('football/stages/seasons/28283', data, NOW, {}).fresh).toBe(DAY);
  });
});

describe('loadCupBracket', () => {
  beforeEach(() => {
    h.calls = [];
    h.stages = uclSeason2526.data;
    h.fail = false;
  });

  it('sezon verilmezse güncel sezon; tek stages isteği (alan seçimi + skor türü filtresi)', async () => {
    h.stages = [];
    const r = await loadCupBracket(2, null, NOW);
    expect(r).toEqual({ ok: true, bracket: null, freshSeconds: 12 * HOUR });
    expect(h.calls.map((c) => c.path)).toEqual(['/leagues/2', '/stages/seasons/28155']);
    expect(h.calls[1]!.params).toEqual({ include: CUP_STAGES_INCLUDE, filters: CUP_STAGES_FILTERS });
  });

  it('seçili sezon ligin listesinden doğrulanır; listede yoksa Sportmonks’a gidilmez', async () => {
    const r = await loadCupBracket(2, 25580, NOW);
    expect(r.ok && r.bracket?.rounds.at(-1)?.ties[0]?.winnerId).toBe(591);
    expect(r.ok && r.freshSeconds).toBe(30 * DAY);
    h.calls = [];
    expect(await loadCupBracket(2, 999, NOW)).toEqual({ ok: false, reason: 'unknownSeason' });
    expect(h.calls.map((c) => c.path)).toEqual(['/leagues/2']);
  });

  it('ağacı olmayan lig → unsupported, istek yok', async () => {
    expect(await loadCupBracket(600, null, NOW)).toEqual({ ok: false, reason: 'unsupported' });
    expect(h.calls).toEqual([]);
  });

  it('upstream hatası fırlatır (hata ≠ veri yok)', async () => {
    h.fail = true;
    await expect(loadCupBracket(2, null, NOW)).rejects.toThrow();
  });
});
