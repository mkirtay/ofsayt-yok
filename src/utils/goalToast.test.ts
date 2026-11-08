import { describe, expect, it } from 'vitest';
import { detectGoals } from './goalDetection';
import {
  dismissGoalToast,
  EMPTY_GOAL_TOAST_QUEUE,
  enqueueGoalToasts,
  GOAL_TOAST_ARM_MS,
  goalToastsArmed,
  isCleanGoal,
  toastableGoalIds,
  visibleFraction,
  type GoalToastItem,
} from './goalToast';

const scores = (entries: Record<string, string>) => new Map(Object.entries(entries));

function item(matchId: string, score: [number, number], side: 'home' | 'away' = 'home'): GoalToastItem {
  return {
    key: `${matchId}:${score[0]}-${score[1]}`,
    matchId,
    side,
    home: { name: `H${matchId}` },
    away: { name: `A${matchId}` },
    score,
    minute: '',
    href: `/match/${matchId}`,
  };
}

describe('isCleanGoal', () => {
  it('bir taraf artıp diğeri azalmadıysa gol', () => {
    expect(isCleanGoal('0-0', '1-0')).toBe(true);
    expect(isCleanGoal('1 - 1', '1 - 2')).toBe(true);
    expect(isCleanGoal('0-0', '1-1')).toBe(true);
  });

  it('VAR iptali / düzeltme / değişmeyen / okunamayan skor gol değil', () => {
    expect(isCleanGoal('1-0', '0-0')).toBe(false);
    expect(isCleanGoal('1-0', '0-1')).toBe(false);
    expect(isCleanGoal('1-0', '1-0')).toBe(false);
    expect(isCleanGoal(undefined, '1-0')).toBe(false);
    expect(isCleanGoal('- : -', '1-0')).toBe(false);
  });
});

describe('toastableGoalIds', () => {
  it('ilk yüklemede (önceki skor yok) bildirim yok', () => {
    const next = scores({ a: '2-1' });
    expect(toastableGoalIds(detectGoals(new Map(), next), new Map(), next)).toEqual([]);
  });

  it('detectGoals sonucundan skor düşmesi içeren düzeltmeyi eler', () => {
    const prev = scores({ a: '0-0', b: '1-0', c: '1-1' });
    const next = scores({ a: '1-0', b: '0-1', c: '1-1' });
    const goals = detectGoals(prev, next);
    expect([...goals.keys()].sort()).toEqual(['a', 'b']);
    expect(toastableGoalIds(goals, prev, next)).toEqual(['a']);
  });
});

describe('goalToastsArmed', () => {
  it('gizli sekmede ya da açılış/dönüşten hemen sonra kapalı', () => {
    expect(goalToastsArmed(1_000_000, 1_000_000 - GOAL_TOAST_ARM_MS, true)).toBe(false);
    expect(goalToastsArmed(1_000_000, 1_000_000 - 1000, false)).toBe(false);
    expect(goalToastsArmed(1_000_000, 1_000_000 - GOAL_TOAST_ARM_MS, false)).toBe(true);
  });
});

describe('gol bildirimi kuyruğu', () => {
  it('en fazla 2 görünür, kalanı sırada; kapatınca sıradaki geçer', () => {
    let q = enqueueGoalToasts(EMPTY_GOAL_TOAST_QUEUE, [item('a', [1, 0]), item('b', [0, 1]), item('c', [1, 1])]);
    expect(q.visible.map((v) => v.matchId)).toEqual(['a', 'b']);
    expect(q.queued.map((v) => v.matchId)).toEqual(['c']);
    q = dismissGoalToast(q, 'a:1-0');
    expect(q.visible.map((v) => v.matchId)).toEqual(['b', 'c']);
    expect(q.queued).toEqual([]);
    q = dismissGoalToast(q, 'b:0-1');
    q = dismissGoalToast(q, 'c:1-1');
    expect(q).toEqual(EMPTY_GOAL_TOAST_QUEUE);
  });

  it('aynı gol iki kez eklenmez (aynı durum nesnesi döner)', () => {
    const q = enqueueGoalToasts(EMPTY_GOAL_TOAST_QUEUE, [item('a', [1, 0])]);
    expect(enqueueGoalToasts(q, [item('a', [1, 0])])).toBe(q);
  });

  it('aynı maçın yeni golü eskisinin yerini alır (görünürde ve sırada)', () => {
    let q = enqueueGoalToasts(EMPTY_GOAL_TOAST_QUEUE, [item('a', [1, 0]), item('b', [1, 0]), item('c', [1, 0])]);
    q = enqueueGoalToasts(q, [item('a', [2, 0]), item('c', [1, 1], 'away')]);
    expect(q.visible.map((v) => v.key)).toEqual(['a:2-0', 'b:1-0']);
    expect(q.queued.map((v) => v.key)).toEqual(['c:1-1']);
  });

  it('sıra taşarsa en eskisi düşer', () => {
    const q = enqueueGoalToasts(
      EMPTY_GOAL_TOAST_QUEUE,
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id, [1, 0])),
    );
    expect(q.visible.map((v) => v.matchId)).toEqual(['a', 'b']);
    expect(q.queued.map((v) => v.matchId)).toEqual(['d', 'e', 'f']);
  });

  it('görünmeyen anahtarı kapatmak durumu değiştirmez', () => {
    const q = enqueueGoalToasts(EMPTY_GOAL_TOAST_QUEUE, [item('a', [1, 0])]);
    expect(dismissGoalToast(q, 'x:1-0')).toBe(q);
  });
});

describe('visibleFraction', () => {
  it('pencere ve liste kutusu içindeki oran', () => {
    expect(visibleFraction({ top: 100, bottom: 140 }, { top: 0, bottom: 800 }, 900)).toBe(1);
    expect(visibleFraction({ top: 880, bottom: 920 }, null, 900)).toBe(0.5);
    // Liste kutusunun içinde kaydırılıp dışarıda kalan satır (react-window overscan)
    expect(visibleFraction({ top: 820, bottom: 860 }, { top: 0, bottom: 800 }, 900)).toBe(0);
    expect(visibleFraction({ top: -60, bottom: -20 }, null, 900)).toBe(0);
  });

  it('gizli liste kutusu (sıfır boyut) görünmez sayılır', () => {
    expect(visibleFraction({ top: 0, bottom: 0 }, { top: 0, bottom: 0 }, 900)).toBe(0);
    expect(visibleFraction({ top: 10, bottom: 50 }, { top: 10, bottom: 10 }, 900)).toBe(0);
  });
});
