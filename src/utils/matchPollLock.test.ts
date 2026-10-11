import { describe, expect, it } from 'vitest';
import { isPollLockedForKickoff, isPollLockedForMatch } from './matchPollLock';

// Başlama: 2026-10-11 18:00 UTC
const KICKOFF = Date.parse('2026-10-11T18:00:00Z');
const base = { status: 'NOT STARTED', date: '2026-10-11', scheduled: '18:00' };

describe('isPollLockedForMatch', () => {
  it('sınır: başlama saatinden 1 ms önce açık, tam saatte ve sonra kilitli', () => {
    expect(isPollLockedForMatch(base, KICKOFF - 1)).toBe(false);
    expect(isPollLockedForMatch(base, KICKOFF)).toBe(true);
    expect(isPollLockedForMatch(base, KICKOFF + 60_000)).toBe(true);
  });

  it('canlı / devre arası / bitti → saatten bağımsız kilitli', () => {
    for (const status of ['IN PLAY', 'HALF TIME BREAK', 'FINISHED']) {
      expect(isPollLockedForMatch({ ...base, status }, KICKOFF - 3_600_000)).toBe(true);
    }
  });

  it('ertelendi / tarih belirsiz / gecikti → saat geçse de açık', () => {
    for (const state_code of ['POSTPONED', 'TBA', 'DELAYED'] as const) {
      expect(isPollLockedForMatch({ ...base, state_code }, KICKOFF + 3_600_000)).toBe(false);
    }
  });

  it('iptal / yarıda kaldı / hükmen → "başlamadı" görünse de kilitli', () => {
    for (const state_code of ['CANCELLED', 'ABANDONED', 'AWARDED'] as const) {
      expect(isPollLockedForMatch({ ...base, state_code }, KICKOFF - 3_600_000)).toBe(true);
    }
  });

  it('başlama saati bilinmeyen başlamamış maç açık', () => {
    expect(isPollLockedForMatch({ status: 'NOT STARTED' }, KICKOFF)).toBe(false);
  });
});

describe('isPollLockedForKickoff', () => {
  it('sınır: 1 ms önce açık, tam saatte kilitli', () => {
    const d = new Date(KICKOFF);
    expect(isPollLockedForKickoff(d, KICKOFF - 1)).toBe(false);
    expect(isPollLockedForKickoff(d, KICKOFF)).toBe(true);
  });
});
