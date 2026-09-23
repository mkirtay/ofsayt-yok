import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { buildFixtureDateGroups, istanbulMatchDate } from './fixtureDateGroups';

function fixture(id: number, date: string, scheduled?: string, home = 'A', away = 'B'): Match {
  return {
    id,
    status: 'NOT STARTED',
    time: '',
    home: { id: id * 10, name: home },
    away: { id: id * 10 + 1, name: away },
    date,
    ...(scheduled !== undefined ? { scheduled } : {}),
  } as Match;
}

describe('istanbulMatchDate', () => {
  it('UTC saatini TR gününe çevirir (21:00 UTC → ertesi gün)', () => {
    expect(istanbulMatchDate(fixture(1, '2026-09-23', '21:30'))).toBe('2026-09-24');
  });

  it('gün içi kalan saatlerde günü değiştirmez', () => {
    expect(istanbulMatchDate(fixture(1, '2026-09-23', '19:00'))).toBe('2026-09-23');
  });

  it('saat yoksa tarihi olduğu gibi bırakır', () => {
    expect(istanbulMatchDate(fixture(1, '2026-09-23'))).toBe('2026-09-23');
  });

  it('tarih yoksa boş döner', () => {
    expect(istanbulMatchDate(fixture(1, ''))).toBe('');
  });
});

describe('buildFixtureDateGroups', () => {
  const todayIso = '2026-09-23';

  it('maçları güne göre gruplar, günleri artan sırada verir', () => {
    const groups = buildFixtureDateGroups(
      [
        fixture(2, '2026-09-24', '19:45'),
        fixture(1, '2026-09-23', '19:45'),
        fixture(3, '2026-09-24', '17:00'),
      ],
      { todayIso },
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-09-23', '2026-09-24']);
    expect(groups[1].matches.map((m) => m.id)).toEqual([3, 2]); // gün içi saate göre
  });

  it('geçmiş günleri eler (bugün dahil edilir)', () => {
    const groups = buildFixtureDateGroups(
      [fixture(1, '2026-09-20', '19:45'), fixture(2, '2026-09-23', '19:45')],
      { todayIso },
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-09-23']);
  });

  it('yaklaşan maç yoksa son oynanan günlere düşer', () => {
    const groups = buildFixtureDateGroups(
      [
        fixture(1, '2026-09-10', '19:45'),
        fixture(2, '2026-09-18', '19:45'),
        fixture(3, '2026-09-19', '19:45'),
      ],
      { todayIso, fallbackPastDays: 2 },
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-09-18', '2026-09-19']);
  });

  it('fallback kapalıyken yaklaşan maç yoksa boş döner', () => {
    const groups = buildFixtureDateGroups([fixture(1, '2026-09-10', '19:45')], {
      todayIso,
      fallbackPastDays: 0,
    });
    expect(groups).toEqual([]);
  });

  it('tarihsiz maçları atar', () => {
    const groups = buildFixtureDateGroups([fixture(1, ''), fixture(2, '2026-09-25', '19:45')], {
      todayIso,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].matches.map((m) => m.id)).toEqual([2]);
  });
});
