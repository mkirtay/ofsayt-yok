import { afterEach, describe, expect, it, vi } from 'vitest';

const h2h = vi.hoisted(() => ({ impl: (() => Promise.resolve(null)) as (a: string, b: string) => Promise<unknown> }));
vi.mock('@/services/liveScoreService', () => ({
  getTeamsHead2Head: (a: string, b: string) => h2h.impl(a, b),
}));

import type { Match } from '@/models/liveScore';
import { loadMatchCardH2h } from './matchCardH2h';

const match = { id: 1, status: 'NOT STARTED', time: '', home: { id: 1888, name: 'Eldense' }, away: { id: 93, name: 'Real Oviedo' } } as Match;
const DATA = { team1: { id: '1888', overall_form: ['W'] }, team2: { id: '93', overall_form: ['L'] }, h2h: [] };

afterEach(() => {
  vi.useRealTimers();
});

describe('loadMatchCardH2h', () => {
  it('bütçe içinde gelirse veri; takım çifti ev/deplasman id\'lerinden', async () => {
    const calls: string[] = [];
    h2h.impl = async (a, b) => {
      calls.push(`${a}:${b}`);
      return DATA;
    };
    expect(await loadMatchCardH2h(match)).toEqual(DATA);
    expect(calls).toEqual(['1888:93']);
  });

  it('veri yoksa null (kart bu bölümleri çizmez, istemci tekrar çekmez)', async () => {
    h2h.impl = async () => null;
    expect(await loadMatchCardH2h(match)).toBeNull();
  });

  it('bütçe aşılırsa undefined (sayfa beklemez, istemci çeker)', async () => {
    vi.useFakeTimers();
    h2h.impl = () => new Promise((resolve) => setTimeout(() => resolve(DATA), 5000));
    const pending = loadMatchCardH2h(match, 700);
    await vi.advanceTimersByTimeAsync(701);
    expect(await pending).toBeUndefined();
  });

  it('hata → undefined; takımlar bilinmiyorsa null', async () => {
    h2h.impl = async () => {
      throw new Error('ağ');
    };
    expect(await loadMatchCardH2h(match)).toBeUndefined();
    expect(await loadMatchCardH2h({ ...match, home: { id: 0, name: '' } } as Match)).toBeNull();
  });
});
