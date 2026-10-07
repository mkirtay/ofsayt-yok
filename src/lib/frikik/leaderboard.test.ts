import { describe, expect, it } from 'vitest';
import { compareRuns, monthlyBest, rankAmong } from './leaderboard';

const at = (s: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, s));

describe('sıralama kuralı', () => {
  it('önce seviye, sonra puan, sonra erken kayıt', () => {
    const a = { level: 5, score: 1000, createdAt: at(10) };
    const b = { level: 4, score: 2000, createdAt: at(1) };
    const c = { level: 5, score: 1200, createdAt: at(20) };
    const d = { level: 5, score: 1200, createdAt: at(5) };
    expect([a, b, c, d].sort(compareRuns)).toEqual([d, c, a, b]);
    expect(rankAmong([a, b, c, d], a)).toBe(3);
    expect(rankAmong([a, b, c, d], { level: 9, score: 0, createdAt: at(99) })).toBe(1);
  });

  it('aylık: kullanıcı başına tek en iyi günlük kayıt (toplam değil)', () => {
    const rows = [
      { userId: 'u1', day: '2026-10-01', level: 3, score: 600, createdAt: at(1) },
      { userId: 'u1', day: '2026-10-02', level: 4, score: 900, createdAt: at(2) },
      { userId: 'u1', day: '2026-10-03', level: 4, score: 700, createdAt: at(3) },
      { userId: 'u2', day: '2026-10-01', level: 2, score: 400, createdAt: at(4) },
      { userId: 'u2', day: '2026-10-02', level: 2, score: 450, createdAt: at(5) },
      { userId: 'u3', day: '2026-10-05', level: 4, score: 900, createdAt: at(0) },
    ];
    const best = monthlyBest(rows);
    expect(best.map((r) => [r.userId, r.day])).toEqual([
      ['u3', '2026-10-05'], // aynı seviye+puan, daha erken kayıt
      ['u1', '2026-10-02'],
      ['u2', '2026-10-02'],
    ]);
    // Toplam olsaydı u1 (2200) açık ara öndeydi; en iyi tek kayıtta u3 ile eşit → erken kayıt belirler
    expect(best.find((r) => r.userId === 'u1')!.score).toBe(900);
  });
});
