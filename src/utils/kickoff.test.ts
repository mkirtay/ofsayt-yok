import { describe, expect, it } from 'vitest';
import { countdown, kickoffInfo, relativeKickoffDay } from './kickoff';

// Eldense – Oviedo: Sportmonks starting_at 2026-10-02 18:30 UTC → 21:30 İstanbul
const match = { date: '2026-10-02', scheduled: '18:30', status: 'NOT STARTED' };
const KICKOFF = Date.UTC(2026, 9, 2, 18, 30);

describe('kickoffInfo', () => {
  it('İstanbul saati ve günü', () => {
    expect(kickoffInfo(match)).toEqual({ ms: KICKOFF, time: '21:30', dayIso: '2026-10-02' });
  });

  it('21:00 UTC sonrası başlayan maç İstanbul\'da ertesi gün', () => {
    expect(kickoffInfo({ date: '2026-10-02', scheduled: '21:30', status: 'NOT STARTED' })?.dayIso).toBe('2026-10-03');
  });

  it('saat yoksa null', () => {
    expect(kickoffInfo({ date: '2026-10-02', scheduled: '', status: 'NOT STARTED' })).toBeNull();
    expect(kickoffInfo(null)).toBeNull();
  });
});

describe('relativeKickoffDay', () => {
  it('bugün / yarın / diğer (İstanbul günü)', () => {
    expect(relativeKickoffDay('2026-10-02', Date.UTC(2026, 9, 2, 6))).toBe('today');
    expect(relativeKickoffDay('2026-10-02', Date.UTC(2026, 9, 1, 20, 59))).toBe('tomorrow'); // 23:59 TR
    expect(relativeKickoffDay('2026-10-02', Date.UTC(2026, 9, 1, 21, 0))).toBe('today'); // 00:00 TR
    expect(relativeKickoffDay('2026-10-04', Date.UTC(2026, 9, 2, 6))).toBeNull();
  });
});

describe('countdown', () => {
  const MIN = 60_000;
  it('gün + saat', () => {
    expect(countdown(KICKOFF, KICKOFF - (27 * 60 + 5) * MIN)).toEqual({ kind: 'left', days: 1, hours: 3, minutes: 0 });
  });
  it('saat + dakika (yukarı yuvarlanır)', () => {
    expect(countdown(KICKOFF, KICKOFF - (2 * 60 + 13.5) * MIN)).toEqual({ kind: 'left', days: 0, hours: 2, minutes: 14 });
  });
  it('yalnız dakika', () => {
    expect(countdown(KICKOFF, KICKOFF - 14 * MIN)).toEqual({ kind: 'left', days: 0, hours: 0, minutes: 14 });
  });
  it('bir dakikadan az → az sonra; saati geçti → bekleniyor', () => {
    expect(countdown(KICKOFF, KICKOFF - 30_000)).toEqual({ kind: 'soon' });
    expect(countdown(KICKOFF, KICKOFF + 5 * MIN)).toEqual({ kind: 'awaiting' });
  });
});
