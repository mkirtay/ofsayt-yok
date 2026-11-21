import { describe, expect, it } from 'vitest';
import { applyMatch, emptyProgress, mergeProgress, parseSummary, sanitizeProgress, type MatchSummary } from './progress';

const m = (o: Partial<MatchSummary>): MatchSummary => ({ mode: '1v1', diff: 'kolay', goalsFor: 1, goalsAgainst: 0, ...o });

describe('miniSaha progress', () => {
  it('başta yalnız Dengeli açık', () => {
    expect(emptyProgress().unlocked).toEqual(['dengeli']);
  });

  it('Duvar 3. galibiyette açılır; mağlubiyet sayılmaz', () => {
    let p = emptyProgress();
    p = applyMatch(p, m({})).progress;
    p = applyMatch(p, m({ goalsFor: 0, goalsAgainst: 2 })).progress;
    p = applyMatch(p, m({})).progress;
    expect(p.unlocked).not.toContain('duvar');
    const r = applyMatch(p, m({}));
    expect(r.newlyUnlocked).toContain('duvar');
    expect(r.progress).toMatchObject({ matches: 4, wins: 3 });
  });

  it('Rüzgâr: bir maçta 3 gol (kaybedilse bile)', () => {
    expect(applyMatch(emptyProgress(), m({ goalsFor: 3, goalsAgainst: 4 })).newlyUnlocked).toEqual(['ruzgar']);
  });

  it('Bomba: en az Orta bota gol yemeden galibiyet; Kolay yetmez', () => {
    expect(applyMatch(emptyProgress(), m({ diff: 'kolay' })).newlyUnlocked).not.toContain('bomba');
    expect(applyMatch(emptyProgress(), m({ diff: 'orta' })).newlyUnlocked).toContain('bomba');
    expect(applyMatch(emptyProgress(), m({ diff: 'zor', goalsAgainst: 1, goalsFor: 2 })).newlyUnlocked).not.toContain('bomba');
  });

  it('Sihirbaz: Zor botu yen; beraberlik yetmez', () => {
    expect(applyMatch(emptyProgress(), m({ diff: 'zor', goalsFor: 2, goalsAgainst: 1 })).newlyUnlocked).toContain('sihirbaz');
    expect(applyMatch(emptyProgress(), m({ diff: 'zor', goalsFor: 1, goalsAgainst: 1 })).newlyUnlocked).not.toContain('sihirbaz');
  });

  it('açılmış karakter tekrar "yeni" sayılmaz', () => {
    const p = applyMatch(emptyProgress(), m({ goalsFor: 3 })).progress;
    expect(applyMatch(p, m({ goalsFor: 5 })).newlyUnlocked).toEqual([]);
  });

  it('sanitize: bozuk veri, bilinmeyen id, wins > matches temizlenir; Dengeli hep açık', () => {
    expect(sanitizeProgress({ matches: 2, wins: 9, unlocked: ['bomba', 'yok', 5] })).toEqual({ matches: 2, wins: 2, unlocked: ['dengeli', 'bomba'] });
    expect(sanitizeProgress('x')).toEqual(emptyProgress());
    expect(sanitizeProgress({ matches: -3, wins: 1.5 })).toEqual(emptyProgress());
  });

  it('parseSummary sınırları', () => {
    expect(parseSummary({ mode: '2v2', diff: 'zor', goalsFor: 2, goalsAgainst: 0 })).not.toBeNull();
    expect(parseSummary({ mode: '3v3', diff: 'zor', goalsFor: 2, goalsAgainst: 0 })).toBeNull();
    expect(parseSummary({ mode: '1v1', diff: 'zor', goalsFor: 99, goalsAgainst: 0 })).toBeNull();
    expect(parseSummary({ mode: '1v1', diff: 'zor', goalsFor: 1.5, goalsAgainst: 0 })).toBeNull();
  });

  it('merge: kilit birleşimi, sayılarda büyük olan', () => {
    const a = { matches: 5, wins: 1, unlocked: ['dengeli', 'bomba'] as const };
    const b = { matches: 2, wins: 2, unlocked: ['dengeli', 'ruzgar'] as const };
    expect(mergeProgress({ ...a, unlocked: [...a.unlocked] }, { ...b, unlocked: [...b.unlocked] })).toEqual({
      matches: 5, wins: 2, unlocked: ['dengeli', 'ruzgar', 'bomba'],
    });
  });
});
