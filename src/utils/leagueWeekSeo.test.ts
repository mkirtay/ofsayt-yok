import { describe, expect, it } from 'vitest';
import { buildWeekSummary, weekDateRange } from './leagueWeekSeo';

const fx = (id: number, h: string, a: string, score: string | null, state: string, ref?: string) => ({
  id, href: `/matches/${id}`, kickoff: null, home: { id: 1, name: h, logo: null }, away: { id: 2, name: a, logo: null }, score, state,
  referee: ref ? { id: id + 100, name: ref } : null,
});

describe('leagueWeekSeo', () => {
  it('tarih aralığı', () => {
    expect(weekDateRange({ start: '2026-11-21', end: '2026-11-24' })).toBe('21 Kasım 2026 – 24 Kasım 2026');
    expect(weekDateRange({ start: '2026-11-21', end: '2026-11-21' })).toBe('21 Kasım 2026');
  });

  it('süren hafta: maç sayısı, tamamlanan, gol, hakem atamaları', () => {
    const s = buildWeekSummary('Süper Lig', '2026/2027', { id: 1, week: 12, start: '2026-11-21', end: '2026-11-24', finished: false, current: true }, [
      fx(1, 'Galatasaray', 'Göztepe', '3-1', 'FT', 'Ali Şansalan'),
      fx(2, 'Fenerbahçe', 'Rizespor', null, 'NS', 'Halil Umut Meler'),
    ]);
    expect(s[0]).toBe('Süper Lig 2026/2027 sezonu 12. haftanın 2 maçı 21 Kasım 2026 – 24 Kasım 2026 tarihlerinde oynanıyor; 1 maç tamamlandı.');
    expect(s[1]).toBe('Tamamlanan 1 maçta 4 gol atıldı (maç başına 4).');
    expect(s[2]).toBe('Hakem atamaları: Ali Şansalan (Galatasaray - Göztepe), Halil Umut Meler (Fenerbahçe - Rizespor).');
  });
});
