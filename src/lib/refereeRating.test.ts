import { describe, expect, it } from 'vitest';
import { parseRefereeScore, refereeRatingWindow, REFEREE_RATING_WINDOW_MS, roundAverage, toAggregate } from './refereeRating';

const KICKOFF = Date.parse('2026-11-01T18:00:00Z');
const finished = { status: 'FINISHED', date: '2026-11-01', scheduled: '18:00', referee_id: 7 };

describe('refereeRatingWindow', () => {
  it('bitmiş maç, süre içinde → açık', () => {
    expect(refereeRatingWindow(finished, KICKOFF + 2 * 3600_000)).toBe('open');
    expect(refereeRatingWindow(finished, KICKOFF + REFEREE_RATING_WINDOW_MS)).toBe('open');
  });

  it('başlamamış / canlı / devre arası → kapalı (not-finished)', () => {
    for (const status of ['NOT STARTED', '2nd Half', 'HALF TIME BREAK', '']) {
      expect(refereeRatingWindow({ ...finished, status }, KICKOFF)).toBe('not-finished');
    }
  });

  it('ertelendi / iptal / hükmen → not-finished', () => {
    for (const state_code of ['POSTPONED', 'CANCELLED', 'AWARDED', 'WALKOVER'] as const) {
      expect(refereeRatingWindow({ ...finished, state_code }, KICKOFF + 3600_000)).toBe('not-finished');
    }
  });

  it('7 gün + 3 sa sonra → closed; başlama saati bilinmiyorsa closed', () => {
    expect(refereeRatingWindow(finished, KICKOFF + REFEREE_RATING_WINDOW_MS + 1)).toBe('closed');
    expect(refereeRatingWindow({ ...finished, scheduled: undefined }, KICKOFF)).toBe('closed');
  });

  it('hakem kimliği yoksa no-referee', () => {
    expect(refereeRatingWindow({ ...finished, referee_id: undefined }, KICKOFF)).toBe('no-referee');
  });
});

describe('parseRefereeScore', () => {
  it('yalnız 1–10 tam sayı', () => {
    expect(parseRefereeScore({ score: 1 })).toBe(1);
    expect(parseRefereeScore({ score: 10 })).toBe(10);
    for (const score of [0, 11, 5.5, '7', null, undefined, NaN, -1]) expect(parseRefereeScore({ score })).toBeNull();
    expect(parseRefereeScore(null)).toBeNull();
    expect(parseRefereeScore('x')).toBeNull();
  });
});

describe('ortalama', () => {
  it('tek ondalığa yuvarlar', () => {
    expect(roundAverage(6.4444)).toBe(6.4);
    expect(roundAverage(6.45)).toBe(6.5);
    expect(roundAverage(null)).toBeNull();
    expect(roundAverage(NaN)).toBeNull();
  });

  it('toAggregate: sürücü sayıyı string / bigint döndürse de', () => {
    expect(toAggregate([{ average: '6.666', count: BigInt(3) }])).toEqual({ average: 6.7, count: 3 });
    expect(toAggregate([{ average: null, count: 0 }])).toEqual({ average: null, count: 0 });
    expect(toAggregate([])).toEqual({ average: null, count: 0 });
  });
});
