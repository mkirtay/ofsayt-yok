import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { fullMatchDate, recentMatchStatus, shortMatchDate } from './recentMatchLabels';

const base = (over: Partial<Match>): Match =>
  ({ id: 1, status: 'FINISHED', time: '', home: { id: 34, name: 'GS' }, away: { id: 2, name: 'X' }, ...over }) as Match;

describe('recentMatchLabels', () => {
  it('bitmiş maçta "MS" yerine TR gününe göre tarih', () => {
    const m = base({ date: '2026-09-19', scheduled: '17:00' });
    expect(recentMatchStatus(m)).toEqual({ kind: 'date', text: '19.09' });
    expect(fullMatchDate(m)).toBe('19.09.2026');
  });

  it('UTC 22:30 maçı TR\'de ertesi gün', () => {
    expect(shortMatchDate(base({ date: '2026-09-19', scheduled: '22:30' }))).toBe('20.09');
  });

  it('canlıda dakika, devre arasında İY', () => {
    expect(recentMatchStatus(base({ status: 'IN PLAY', time: "67'" }))).toEqual({ kind: 'live', text: "67'" });
    expect(recentMatchStatus(base({ status: 'HALF TIME BREAK' }))).toEqual({ kind: 'live', text: 'İY' });
  });

  it('ertelenmiş / iptal kısa durum', () => {
    expect(recentMatchStatus(base({ status: 'NOT STARTED', state_code: 'POSTPONED', date: '2026-09-01' }))).toMatchObject({
      kind: 'special',
      key: 'postponedShort',
    });
    expect(recentMatchStatus(base({ status: 'FINISHED', state_code: 'CANCELLED' }))).toMatchObject({ key: 'cancelledShort' });
  });
});
