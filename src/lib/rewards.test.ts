import { describe, expect, it } from 'vitest';
import { finishedRewardMonths, isRewardWeek, planMonthRewards, planWeekRewards, previousMonth } from './rewards';
import { seasonMonthRange, seasonOfMonth } from './frikik/leaderboard';

describe('haftalık tahmin ödülleri', () => {
  it('bütün maçları tahmin edene +1; ilk 3 en az 5 tahmin ve puan > 0 şartıyla +3/+2/+1', () => {
    const rows = [
      { userId: 'a', points: 30, picks: 4 }, // ilk sırada ama 5 tahmin yok → ilk 3 ödülü sıradakine
      { userId: 'b', points: 25, picks: 10 },
      { userId: 'c', points: 20, picks: 6 },
      { userId: 'd', points: 10, picks: 10 },
      { userId: 'e', points: 0, picks: 10 }, // puan yok → ilk 3 değil, katılım var
    ];
    const plan = planWeekRewards('2026-W47', rows, 10);
    const full = plan.filter((p) => p.key.endsWith(':full')).map((p) => p.userId);
    const top = plan.filter((p) => p.key.endsWith(':top')).map((p) => [p.userId, p.amount]);
    expect(full).toEqual(['b', 'd', 'e']);
    expect(top).toEqual([
      ['b', 3],
      ['c', 2],
      ['d', 1],
    ]);
    expect(new Set(plan.map((p) => `${p.userId}|${p.key}`)).size).toBe(plan.length); // kullanıcı × anahtar tekil
  });

  it('maçsız hafta katılım ödülü vermez', () => {
    expect(planWeekRewards('2026-W47', [{ userId: 'a', points: 0, picks: 0 }], 0)).toEqual([]);
  });

  it('başlangıç haftasından önceki haftalar ödüllenmez', () => {
    expect(isRewardWeek('2026-W45')).toBe(false);
    expect(isRewardWeek('2026-W46')).toBe(true);
    expect(isRewardWeek('2027-W01')).toBe(true);
  });
});

describe('aylık frikik ödülleri', () => {
  it('7+ gün oynayana +2; ilk 3 +5/+4/+3', () => {
    const plan = planMonthRewards('2026-11', [{ userId: 'x' }, { userId: 'y' }, { userId: 'z' }, { userId: 'w' }], [{ userId: 'y' }, { userId: 'q' }]);
    expect(plan.filter((p) => p.key.endsWith(':active')).map((p) => [p.userId, p.amount])).toEqual([
      ['y', 2],
      ['q', 2],
    ]);
    expect(plan.filter((p) => p.key.endsWith(':top')).map((p) => [p.userId, p.amount])).toEqual([
      ['x', 5],
      ['y', 4],
      ['z', 3],
    ]);
  });

  it('bitmiş aylar: önceki ay(lar), başlangıç ayından eskisi yok', () => {
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(finishedRewardMonths('2026-11')).toEqual([]);
    expect(finishedRewardMonths('2026-12')).toEqual(['2026-11']);
    expect(finishedRewardMonths('2027-02')).toEqual(['2027-01', '2026-12']);
  });
});

describe('frikik sezonu', () => {
  it('Temmuz–Haziran', () => {
    expect(seasonOfMonth('2026-11')).toBe('2026-27');
    expect(seasonOfMonth('2027-06')).toBe('2026-27');
    expect(seasonOfMonth('2027-07')).toBe('2027-28');
    expect(seasonMonthRange('2026-27')).toEqual(['2026-07', '2027-06']);
  });
});
