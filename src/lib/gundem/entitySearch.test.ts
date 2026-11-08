import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { mapPlayerHits, normalizeEntityQuery, pickMatchHits } from './entitySearch';

const m = (id: number, home: string, away: string, status: string, scheduled: string, over: Partial<Match> = {}): Match => ({
  id,
  status,
  time: '',
  date: '2026-11-08',
  scheduled,
  home: { id: id * 10, name: home },
  away: { id: id * 10 + 1, name: away },
  competition: { id: 600, name: 'Süper Lig' },
  ...over,
});

describe('normalizeEntityQuery', () => {
  it('kısa / izin dışı karakter → null; boşluklar sadeleşir, 40 karakterde kesilir', () => {
    expect(normalizeEntityQuery('a')).toBeNull();
    expect(normalizeEntityQuery('gala/../x')).toBeNull();
    expect(normalizeEntityQuery('fener;drop')).toBeNull();
    expect(normalizeEntityQuery(['x'])).toBeNull();
    expect(normalizeEntityQuery('  Brighton   & Hove ')).toBe('Brighton & Hove');
    expect(normalizeEntityQuery('Fenerbahçe')).toBe('Fenerbahçe');
    expect(normalizeEntityQuery('a'.repeat(60))).toHaveLength(40);
  });
});

describe('mapPlayerHits', () => {
  it('tam ad eşleşmesi öne, adsız atılır, sınır uygulanır', () => {
    const hits = mapPlayerHits(
      [
        { id: 1, display_name: 'Mauro Icardi Jr', image_path: 'a.png' },
        { id: 2, common_name: 'Icardi', display_name: 'M. Icardi' },
        { id: 3 },
      ],
      'icardi',
    );
    expect(hits.map((h) => h.id)).toEqual([2, 1]);
    expect(hits[1]).toEqual({ id: 1, name: 'Mauro Icardi Jr', photo: 'a.png' });
  });
});

describe('pickMatchHits', () => {
  it('Türkçe karakterden bağımsız eşleşir; canlı → başlamamış (yakın önce) → bitmiş (yeni önce); tekil + canlı sürüm', () => {
    const today = [
      m(1, 'Galatasaray', 'Fenerbahçe', 'NOT STARTED', '17:00'),
      m(2, 'Beşiktaş', 'Göztepe', 'FINISHED', '10:00'),
      m(3, 'Trabzonspor', 'Fenerbahce B', 'NOT STARTED', '12:00'),
      m(4, 'Fenerbahçe', 'Samsunspor', 'FINISHED', '11:00'),
    ];
    const live = [m(1, 'Galatasaray', 'Fenerbahçe', 'IN PLAY', '17:00')];
    const hits = pickMatchHits([today, live], 'fenerbahce');
    expect(hits.map((h) => [h.id, h.status])).toEqual([
      [1, 'IN PLAY'],
      [3, 'NOT STARTED'],
      [4, 'FINISHED'],
    ]);
    expect(hits[0]).toMatchObject({ league: 'Süper Lig', startingAt: '2026-11-08T17:00:00.000Z', home: { name: 'Galatasaray', logo: null } });
  });

  it('boş sorgu → hepsi (sınırlı)', () => {
    const list = [...Array(10)].map((_, i) => m(i + 1, `A${i}`, `B${i}`, 'NOT STARTED', `1${i}:00`));
    expect(pickMatchHits([list], null)).toHaveLength(6);
  });
});
