import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { buildMatchSeo, normalizeScore } from './matchSeo';

const brand = (t: string) => `${t} | Scor3`;
const base = {
  id: 1,
  time: '',
  home: { id: 1, name: 'Galatasaray' },
  away: { id: 2, name: 'Fenerbahçe' },
  competition: { id: 600, name: 'Süper Lig' },
  date: '2026-11-22',
  scheduled: '16:00',
  round: '13',
} as unknown as Match;

describe('buildMatchSeo', () => {
  it('oynanmamış maç: ne zaman / saat kaçta başlığı, TSİ saat, yayıncı', () => {
    const s = buildMatchSeo({ ...base, status: 'NOT STARTED', tv_stations: ['beIN Sports 1'], venue_info: { name: 'RAMS Park', city: 'İstanbul' } }, brand);
    expect(s.title).toBe('Galatasaray - Fenerbahçe Maçı Ne Zaman, Saat Kaçta? | Scor3');
    expect(s.h1).toBe('Galatasaray - Fenerbahçe · Süper Lig');
    const text = s.summary.join(' ');
    expect(text).toContain('22 Kasım 2026 Pazar, saat 19:00 (TSİ) karşı karşıya');
    expect(text).toContain('13. hafta');
    expect(text).toContain('Stadyum: RAMS Park (İstanbul).');
    expect(text).toContain('Yayın: beIN Sports 1.');
    expect(s.description).toContain('Yayıncı: beIN Sports 1.');
  });

  it('bitmiş maç: skorlu maç sonucu başlığı', () => {
    const s = buildMatchSeo({ ...base, status: 'FINISHED', scores: { score: '2 - 1' } }, brand);
    expect(s.title).toBe('Galatasaray 2-1 Fenerbahçe Maç Sonucu | Scor3');
    expect(s.h1).toBe('Galatasaray 2-1 Fenerbahçe');
    expect(s.summary[0]).toContain('maç 2-1 sona erdi');
  });

  it('canlı maç ve ertelenen maç', () => {
    expect(buildMatchSeo({ ...base, status: 'IN PLAY', scores: { score: '0-0' } }, brand).title).toBe('Galatasaray - Fenerbahçe Canlı Skor (0-0) | Scor3');
    const p = buildMatchSeo({ ...base, status: 'NOT STARTED', state_code: 'POSTPONED' }, brand);
    expect(p.summary[0]).toContain('henüz kesinleşmedi');
  });

  it('takım adı yoksa genel metin, özet yok', () => {
    const s = buildMatchSeo(null, brand);
    expect(s.title).toBe('Maç Detayı | Scor3');
    expect(s.summary).toEqual([]);
  });

  it('normalizeScore', () => {
    expect(normalizeScore('3 - 0')).toBe('3-0');
    expect(normalizeScore('?-?')).toBeNull();
    expect(normalizeScore(undefined)).toBeNull();
  });
});
