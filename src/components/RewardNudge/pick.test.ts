import { describe, expect, it } from 'vitest';
import { GAME_BRAND } from '@/config/brand';
import type { OnboardingStatus } from '@/server/rewards';
import { istanbulDay, isRewardNudgeHiddenPath, pickNudgeMessage, shownToday } from './pick';

const status = (over: Partial<OnboardingStatus> = {}, progress: Partial<OnboardingStatus['progress']> = {}): OnboardingStatus => ({
  verified: true,
  tasks: [
    { id: 'analysis', done: true, claimed: true, reward: 1 },
    { id: 'prediction', done: true, claimed: true, reward: 1 },
    { id: 'gundem', done: true, claimed: true, reward: 1 },
    { id: 'frikik', done: true, claimed: true, reward: 1 },
  ],
  progress: { frikikDays: 5, frikikTarget: 7, week: { picks: 4, matches: 10 }, ...progress },
  ...over,
});

describe('günlük ödül kartı', () => {
  it('İstanbul günü ile günde bir kez (UTC 21:30 ertesi gündür)', () => {
    const late = Date.parse('2026-11-13T21:30:00Z');
    expect(istanbulDay(late)).toBe('2026-11-14');
    expect(shownToday('2026-11-14', late)).toBe(true);
    expect(shownToday('2026-11-13', late)).toBe(false);
    expect(shownToday(null, late)).toBe(false);
  });

  it('profil / giriş / yönetici sayfalarında çıkmaz', () => {
    for (const p of ['/profile', '/auth/signin', '/admin', '/yasal/gizlilik']) expect(isRewardNudgeHiddenPath(p)).toBe(true);
    for (const p of ['/', '/frikik', '/gundem', GAME_BRAND.basePath]) expect(isRewardNudgeHiddenPath(p)).toBe(false);
  });

  it('Frikik sayfasında bu ayın gün ilerlemesi; hedefe ulaşınca "tamam"', () => {
    expect(pickNudgeMessage('/frikik', status())).toEqual({ kind: 'frikik', days: 5, target: 7 });
    expect(pickNudgeMessage('/frikik', status({}, { frikikDays: 8 }))).toEqual({ kind: 'frikikDone', target: 7 });
  });

  it('tahmin sayfasında haftanın ilerlemesi; hafta listesi yoksa genele düşer', () => {
    expect(pickNudgeMessage(GAME_BRAND.basePath, status())).toEqual({ kind: 'game', picks: 4, matches: 10 });
    expect(pickNudgeMessage(`${GAME_BRAND.basePath}/x`, status({}, { week: { picks: 10, matches: 10 } }))).toEqual({ kind: 'gameDone' });
    expect(pickNudgeMessage(GAME_BRAND.basePath, status({}, { week: null })).kind).toBe('games');
  });

  it('diğer sayfalar: doğrulanmamış > alınacak görev > yapılmamış görev > genel', () => {
    expect(pickNudgeMessage('/frikik', status({ verified: false })).kind).toBe('verify');
    const tasks = status().tasks.map((t, i) => (i === 0 ? { ...t, claimed: false } : i === 1 ? { ...t, done: false, claimed: false } : t));
    expect(pickNudgeMessage('/', status({ tasks }))).toEqual({ kind: 'tasksReady', count: 1 });
    expect(pickNudgeMessage('/', status({ tasks: tasks.map((t, i) => (i === 0 ? { ...t, claimed: true } : t)) }))).toEqual({ kind: 'tasksOpen', count: 1 });
    expect(pickNudgeMessage('/', status())).toEqual({ kind: 'games', days: 5, target: 7 });
  });
});
