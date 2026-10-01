import { describe, expect, it } from 'vitest';
import type { MatchLineupData } from '@/models/domain';
import { isProbableLineup } from './lineupStatus';

const team = (bench: boolean) => ({
  team: { id: '1', name: 'X' },
  players: [
    { id: '1', name: 'A', substitution: '0' },
    ...(bench ? [{ id: '2', name: 'B', substitution: '1' }] : []),
  ],
});
const lineup = (bench: boolean, confirmed?: boolean | null) =>
  ({ lineup: { home: team(bench), away: team(bench) }, confirmed }) as unknown as MatchLineupData;

describe('isProbableLineup', () => {
  it('metadata confirmed önceliklidir', () => {
    expect(isProbableLineup(lineup(true, false), 'PRE')).toBe(true);
    expect(isProbableLineup(lineup(false, true), 'PRE')).toBe(false);
  });

  it('metadata yoksa: başlamamış maçta yedeksiz kadro tahmini', () => {
    expect(isProbableLineup(lineup(false, null), 'PRE')).toBe(true);
    expect(isProbableLineup(lineup(true, null), 'PRE')).toBe(false);
  });

  it('metadata yoksa başlamış/bitmiş maçta tahmin sayılmaz', () => {
    expect(isProbableLineup(lineup(false), 'LIVE')).toBe(false);
    expect(isProbableLineup(lineup(false), 'POST')).toBe(false);
  });
});
