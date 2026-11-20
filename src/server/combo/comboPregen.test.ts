import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';
import { COMBO_PREGEN_MIN_LEAD_MS, loadComboPregenCandidates, selectComboPregenCandidates } from './comboPregen';

const NOW = Date.parse('2026-11-21T07:00:00Z'); // 10:00 TSİ
/** Sportmonks maçı: UTC `date` + `scheduled`. */
const m = (id: number, league: number, hoursFromNow: number, opts: { status?: string; turkish?: boolean } = {}): Match => {
  const ko = new Date(NOW + hoursFromNow * 3600_000).toISOString();
  return {
    id,
    status: opts.status ?? 'NOT STARTED',
    date: ko.slice(0, 10),
    scheduled: ko.slice(11, 16),
    competition_id: league,
    competition: { id: league, name: `L${league}` },
    home: { id: id * 10, name: `Ev${id}`, country_id: opts.turkish ? 404 : 1 },
    away: { id: id * 10 + 1, name: `Dep${id}`, country_id: 1 },
  } as unknown as Match;
};

describe('kupon havuzu sabah ön üretimi — aday seçimi', () => {
  it('havuzdaki başlamamış maçlar (Türk takımı olmayan UEFA dahil), başlama saatine göre; kapsam dışı / başlamış / çok yakın atlanır', () => {
    const matches = [
      m(1, 2, 11), // Şampiyonlar Ligi, Türk takımı yok → genel ön üretimde yoktu, havuzda var
      m(2, 600, 6), // Süper Lig
      m(3, 999, 5), // kapsam dışı lig
      m(4, 600, 3, { status: 'LIVE' }),
      m(5, 600, COMBO_PREGEN_MIN_LEAD_MS / 3600_000 / 2), // 15 dk sonra
    ];
    const out = selectComboPregenCandidates(matches, {}, { now: NOW, national: false });
    expect(out.map((c) => [c.id, c.reason])).toEqual([
      [2, 'combo-pool'],
      [1, 'combo-pool'],
    ]);
  });

  it('milli maç (AF kimliği) yalnız milli analiz açıkken', () => {
    const national = { ...m(1, 2, 5), id: 2_000_000_123, competition_id: 2_000_000_001, competition: { id: 2_000_000_001 }, home: { id: 1, name: 'Türkiye' }, away: { id: 2, name: 'İspanya' } } as unknown as Match;
    expect(selectComboPregenCandidates([national], {}, { now: NOW, national: false })).toEqual([]);
    expect(selectComboPregenCandidates([national], {}, { now: NOW, national: true }).map((c) => c.id)).toEqual([2_000_000_123]);
  });
});

describe('loadComboPregenCandidates', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('kombine aracı kapalıyken ya da 09:00 TSİ öncesinde hiçbir şey okumaz', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '');
    expect(await loadComboPregenCandidates(NOW)).toEqual([]);
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    expect(await loadComboPregenCandidates(Date.parse('2026-11-21T05:30:00Z'))).toEqual([]); // 08:30 TSİ
  });
});
