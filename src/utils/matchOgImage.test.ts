import { describe, expect, it } from 'vitest';
import { matchOgImagePath, matchOgVersion } from './matchOgImage';

const m = (status: string, extra: Record<string, unknown> = {}) => ({ id: 19745050, status, time: '', ...extra });

describe('matchOgVersion / matchOgImagePath', () => {
  it('durum + skor (+ canlı dakika) → yalnız [A-Za-z0-9_-]', () => {
    expect(matchOgVersion(m('NOT STARTED'))).toBe('S');
    expect(matchOgVersion(m('IN PLAY', { time: "67'", scores: { score: '1 - 0' } }))).toBe('L67_1-0');
    expect(matchOgVersion(m('HALF TIME BREAK', { scores: { score: '2-2' } }))).toBe('H_2-2');
    expect(matchOgVersion(m('FINISHED', { score: '3 - 1' }))).toBe('F_3-1');
    expect(matchOgVersion(m('POSTPONED'))).toBe('X');
    expect(matchOgVersion(m('IN PLAY'))).toBe('L0_0-0');
  });

  it('adres yalnız kimlik + sürüm taşır (takım adı / skor metni yok)', () => {
    expect(matchOgImagePath({ ...m('FINISHED', { score: '2-1' }), home: { id: 1, name: 'A' } } as never)).toBe(
      '/api/og/match/19745050?v=F_2-1',
    );
  });
});
