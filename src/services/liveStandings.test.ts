import { describe, expect, it, vi } from 'vitest';

const request = vi.fn();
vi.mock('./sportmonksRuntimeClient', () => ({ sportmonksClientRequest: (...a: unknown[]) => request(...a) }));

const { applyLiveStandings, fetchLiveStandings, hasLiveMatchInLeague, isLiveMatchStatus } = await import('./liveStandings');

const base = (id: number, rank: number, points: number) => ({ rank, points, team: { id }, team_id: id });
const live = (participant_id: number, position: number, points: number, extra: Record<string, unknown> = {}) => ({
  participant_id,
  position,
  points,
  result: 'equal',
  season_id: 28203,
  stage_id: 1,
  group_id: null,
  ...extra,
});

describe('fetchLiveStandings', () => {
  it('tek istek (include yok), geçersiz satırlar atılır; hata fırlatır', async () => {
    request.mockResolvedValueOnce({ data: [live(34, 1, 22), { participant_id: null, position: 2, points: 1 }] });
    await expect(fetchLiveStandings(600)).resolves.toEqual({ leagueId: 600, rows: [live(34, 1, 22)] });
    expect(request).toHaveBeenCalledWith('football', '/standings/live/leagues/600');
    request.mockRejectedValueOnce(new Error('429'));
    await expect(fetchLiveStandings(600)).rejects.toThrow('429');
  });
});

describe('applyLiveStandings', () => {
  const rows = [base(34, 1, 19), base(88, 2, 17), base(2, 3, 16)];

  it('canlı sıra + puan bindirilir, canlı sıraya göre dizilir; ok normal tabloya göre', () => {
    const out = applyLiveStandings(rows, { leagueId: 600, rows: [live(34, 2, 19), live(88, 3, 17), live(2, 1, 19)] }, { seasonId: 28203 });
    expect(out?.map((r) => [r.row.team.id, r.rank, r.points, r.move, r.pointsChanged])).toEqual([
      [2, 1, 19, 'up', true],
      [34, 2, 19, 'down', false],
      [88, 3, 17, 'down', false],
    ]);
  });

  it('uygulanamazsa null (normal tablo): veri yok / sezon farklı / eksik takım / tekrar eden sıra', () => {
    expect(applyLiveStandings(rows, null)).toBeNull();
    expect(applyLiveStandings(rows, { leagueId: 600, rows: [] })).toBeNull();
    const all = [live(34, 1, 19), live(88, 2, 17), live(2, 3, 16)];
    expect(applyLiveStandings(rows, { leagueId: 600, rows: all }, { seasonId: 25749 })).toBeNull();
    expect(applyLiveStandings(rows, { leagueId: 600, rows: all.slice(0, 2) }, { seasonId: 28203 })).toBeNull();
    expect(applyLiveStandings(rows, { leagueId: 600, rows: [live(34, 1, 19), live(88, 1, 17), live(2, 3, 16)] })).toBeNull();
  });

  it('çok aşamalı ligde aynı takımın satırı aşama id ile seçilir; aşama verilmezse belirsizlik → null', () => {
    const two = [live(34, 5, 10, { stage_id: 1 }), live(34, 1, 3, { stage_id: 2 })];
    expect(applyLiveStandings([base(34, 1, 3)], { leagueId: 636, rows: two }, { stageId: 2 })?.[0]).toMatchObject({ rank: 1, points: 3, move: null });
    expect(applyLiveStandings([base(34, 1, 3)], { leagueId: 636, rows: two })).toBeNull();
  });
});

describe('canlı kapısı', () => {
  it('yalnız o ligin oynanan / devre arasındaki maçı', () => {
    const m = (id: number, status: string) => ({ competition: { id }, status });
    expect(hasLiveMatchInLeague([m(600, 'IN PLAY')], 600)).toBe(true);
    expect(hasLiveMatchInLeague([m(600, 'HALF TIME BREAK')], 600)).toBe(true);
    expect(hasLiveMatchInLeague([m(600, 'FINISHED'), m(8, 'IN PLAY')], 600)).toBe(false);
    expect(hasLiveMatchInLeague([m(600, 'IN PLAY')], null)).toBe(false);
    expect(isLiveMatchStatus('NOT STARTED')).toBe(false);
    expect(isLiveMatchStatus(undefined)).toBe(false);
  });
});
