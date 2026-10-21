import { describe, expect, it, vi, beforeEach } from 'vitest';
import sample from './__fixtures__/predictedLineupsSuperLig.json';
import type { SportmonksFixtureWithPredicted } from './predictedLineups';

const request = vi.fn();
vi.mock('../sportmonksRuntimeClient', () => ({ sportmonksClientRequest: (...args: unknown[]) => request(...args) }));

import {
  fetchPredictedLineups,
  mapSportmonksPredictedLineups,
  PREDICTED_LINEUPS_INCLUDE,
  PREDICTED_LINEUPS_WINDOW_MS,
  shouldLoadPredictedLineups,
} from './predictedLineups';
import { buildFormationLayout } from '@/utils/lineupFormation';

const fixture = sample as unknown as SportmonksFixtureWithPredicted;

describe('mapSportmonksPredictedLineups — gerçek yanıt (Alanyaspor–Kocaelispor, 19746580)', () => {
  const data = mapSportmonksPredictedLineups(fixture)!;

  it("iki takıma 11'er ilk-11 oyuncusu, yedek yok; her zaman tahmini", () => {
    expect(data.confirmed).toBe(false);
    expect(data.source).toBe('predicted');
    expect(data.lineup.home.team.name).toBe('Alanyaspor');
    expect(data.lineup.away.team.name).toBe('Kocaelispor');
    for (const side of [data.lineup.home, data.lineup.away]) {
      expect(side.players).toHaveLength(11);
      expect(side.players.every((p) => p.substitution === '0')).toBe(true);
    }
  });

  it("saha ızgarası formation_field'dan: ev 3-4-3, deplasman 4-3-3", () => {
    const home = buildFormationLayout(data.lineup.home.players);
    const away = buildFormationLayout(data.lineup.away.players);
    expect(home.source).toBe('grid');
    expect(home.label).toBe('3-4-3');
    expect(away.label).toBe('4-3-3');
  });

  it('temel mevki oyuncudan (satırdaki position_id ayrıntılı mevki), forma no + foto + bayrak', () => {
    const p = data.lineup.home.players.find((x) => x.id === '32518')!;
    expect(p.name).toBe('Florent Hadergjonaj');
    expect(p.position).toBe('MF');
    expect(p.shirt_number).toBe('94');
    expect(p.photo).toContain('32518.png');
    expect(p.nationality?.name).toBe('Kosovo');
    expect(p.formation_row).toBe(3);
    expect(p.formation_col).toBe(1);
    expect(p.pos_code).toBeTruthy();
  });

  it('oyuncu nesnesi yoksa satırdan: temel mevki 24–27 değilse mevki boş, ad player_name', () => {
    const rows = fixture.predictedlineups!;
    const row = { ...rows[0]!, player: null };
    const one = mapSportmonksPredictedLineups({ ...fixture, predictedlineups: [row, ...rows.slice(1)] })!;
    const side = row.team_id === 347 ? one.lineup.home : one.lineup.away;
    const p = side.players.find((x) => x.id === String(row.player_id))!;
    expect(p.name).toBe(row.player_name);
    expect(p.position).toBeUndefined();
  });

  it('satır yok / boş / tek takım → null (bölüm yok)', () => {
    expect(mapSportmonksPredictedLineups(null)).toBeNull();
    expect(mapSportmonksPredictedLineups({ ...fixture, predictedlineups: undefined })).toBeNull();
    expect(mapSportmonksPredictedLineups({ ...fixture, predictedlineups: [] })).toBeNull();
    const homeOnly = fixture.predictedlineups!.filter((r) => r.team_id === 347);
    expect(mapSportmonksPredictedLineups({ ...fixture, predictedlineups: homeOnly })).toBeNull();
  });
});

describe('fetchPredictedLineups', () => {
  beforeEach(() => request.mockReset());

  it('tek fixtures/{id} isteği, include sabit', async () => {
    request.mockResolvedValue({ data: fixture });
    const data = await fetchPredictedLineups('19746580');
    expect(request).toHaveBeenCalledWith('football', '/fixtures/19746580', { include: PREDICTED_LINEUPS_INCLUDE });
    expect(data?.source).toBe('predicted');
  });

  it('tahmin yoksa null; hata FIRLATIR (hata ≠ veri yok)', async () => {
    request.mockResolvedValueOnce({ data: { ...fixture, predictedlineups: [] } });
    await expect(fetchPredictedLineups('1')).resolves.toBeNull();
    request.mockRejectedValueOnce(new Error('429'));
    await expect(fetchPredictedLineups('1')).rejects.toThrow('429');
  });
});

describe('shouldLoadPredictedLineups', () => {
  const now = Date.parse('2026-10-21T09:00:00Z');
  const base = { phase: 'PRE', hasLineups: false, kickoffMs: now + 2 * 86_400_000, now };

  it('başlamamış, kadrosuz, ≤ 3 gün → evet', () => {
    expect(shouldLoadPredictedLineups(base)).toBe(true);
    expect(shouldLoadPredictedLineups({ ...base, kickoffMs: now + PREDICTED_LINEUPS_WINDOW_MS })).toBe(true);
  });

  it('kadro varsa / başladıysa / bittiyse / 3 günden uzaksa / saat geçtiyse / bilinmiyorsa → hayır', () => {
    expect(shouldLoadPredictedLineups({ ...base, hasLineups: true })).toBe(false);
    expect(shouldLoadPredictedLineups({ ...base, phase: 'LIVE' })).toBe(false);
    expect(shouldLoadPredictedLineups({ ...base, phase: 'POST' })).toBe(false);
    expect(shouldLoadPredictedLineups({ ...base, kickoffMs: now + PREDICTED_LINEUPS_WINDOW_MS + 1 })).toBe(false);
    expect(shouldLoadPredictedLineups({ ...base, kickoffMs: now - 1 })).toBe(false);
    expect(shouldLoadPredictedLineups({ ...base, kickoffMs: null })).toBe(false);
  });
});
