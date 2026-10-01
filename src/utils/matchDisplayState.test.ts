import { describe, expect, it } from 'vitest';
import { mapSportmonksStateCode, mapSportmonksStateToPhase } from '@/services/sportmonks/stateMapping';
import { matchDisplayState, specialKeepsData } from './matchDisplayState';

const fromState = (stateId: number) =>
  matchDisplayState({ status: mapSportmonksStateToPhase(stateId), state_code: mapSportmonksStateCode(stateId) });

describe('Sportmonks state_id → ekrandaki durum', () => {
  it('normal durumlarda özel kod yok', () => {
    expect(fromState(1)).toEqual({ phase: 'PRE', special: null }); // NS
    expect(fromState(2)).toEqual({ phase: 'LIVE', special: null }); // 1st
    expect(fromState(3)).toEqual({ phase: 'HT', special: null }); // HT
    expect(fromState(5)).toEqual({ phase: 'POST', special: null }); // FT
    expect(fromState(26)).toEqual({ phase: 'PRE', special: null }); // Pending → normal "başlamadı"
  });

  it('kovanın yuttuğu özel durumlar ayrılır, kova aynı kalır', () => {
    expect(fromState(10)).toEqual({ phase: 'PRE', special: 'postponed' });
    expect(fromState(13)).toEqual({ phase: 'PRE', special: 'tba' });
    expect(fromState(16)).toEqual({ phase: 'PRE', special: 'delayed' });
    expect(fromState(11)).toEqual({ phase: 'HT', special: 'suspended' });
    expect(fromState(18)).toEqual({ phase: 'HT', special: 'suspended' });
    expect(fromState(12)).toEqual({ phase: 'POST', special: 'cancelled' });
    expect(fromState(20)).toEqual({ phase: 'POST', special: 'cancelled' });
    expect(fromState(15)).toEqual({ phase: 'POST', special: 'abandoned' });
    expect(fromState(14)).toEqual({ phase: 'POST', special: 'awarded' });
    expect(fromState(17)).toEqual({ phase: 'POST', special: 'awarded' });
  });

  it('maç yoksa başlamadı sayılır', () => {
    expect(matchDisplayState(null)).toEqual({ phase: 'PRE', special: null });
  });

  it('yalnız oynanmış kısmı olabilecek durumlar veriyi korur', () => {
    expect(specialKeepsData('abandoned')).toBe(true);
    expect(specialKeepsData('suspended')).toBe(true);
    expect(specialKeepsData('awarded')).toBe(true);
    expect(specialKeepsData('postponed')).toBe(false);
    expect(specialKeepsData('cancelled')).toBe(false);
    expect(specialKeepsData('tba')).toBe(false);
    expect(specialKeepsData('delayed')).toBe(false);
  });
});
