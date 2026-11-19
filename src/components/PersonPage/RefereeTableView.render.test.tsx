import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/router', () => ({ useRouter: () => ({ isReady: false, query: {}, push: vi.fn(), replace: vi.fn() }) }));

import RefereeTableView from './RefereeTableView';
import type { RefereeLeagueTable } from '@/server/people/refereeLeagueTable';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const line = (refereeId: number, name: string, slug: string, matches: number, yellow: number) => ({
  refereeId, name, slug, seasonId: 28203, seasonName: '2026/2027', matches,
  yellowPerMatch: yellow, redPerMatch: 0, penaltiesPerMatch: 0.25, foulsPerMatch: 26, varPerMatch: null,
});

const data: RefereeLeagueTable = {
  league: { id: 600, slug: 'super-lig', nameKey: 'superLig', group: 'tr', source: 'referee-stats' },
  season: { id: 28203, name: '2026/2027', slug: '2026-2027', isCurrent: true },
  seasons: [{ name: '2026/2027', slug: '2026-2027' }, { name: '2025/2026', slug: '2025-2026' }],
  rows: [line(62331, 'Batuhan Kolak', 'batuhan-kolak-62331', 4, 3.5), line(1, 'Ali Şansalan', 'ali-sansalan-1', 2, 8.33)],
};

describe('<RefereeTableView /> (SSR)', () => {
  const html = renderToStaticMarkup(<RefereeTableView data={data} />);
  it('başlık, lig çipleri, sezon seçici; satırlar hakem sayfasına link', () => {
    expect(html).toContain('Süper Lig Hakem İstatistikleri 2026/2027');
    expect(html).toContain('href="/hakemler/1-lig"');
    expect(html).toContain('<option value="2025-2026">2025/2026</option>');
    expect(html).toContain('href="/hakem/batuhan-kolak-62331"');
  });
  it('varsayılan maç sırası; 3 maçtan az hakemde "az maç"; sıralanabilir başlıklar', () => {
    expect(html.indexOf('Batuhan Kolak')).toBeLessThan(html.indexOf('Ali Şansalan'));
    expect(html.match(/az maç</g)).toHaveLength(1);
    expect(html).toContain('aria-sort="descending"');
    expect(html.match(/<button type="button"/g)!.length).toBeGreaterThanOrEqual(6);
  });
  it('lig seçici: Türkiye / UEFA / Avrupa ligleri satırları; yan panel lig ortalaması (maç ağırlıklı) ve seçim ipucu', () => {
    expect(html).toContain('href="/hakemler/sampiyonlar-ligi"');
    expect(html).toContain('href="/hakemler/premier-lig"');
    expect(html).toContain('Avrupa ligleri');
    expect(html).toContain('data-testid="referee-table-side"');
    expect(html).toContain('2 hakem · 6 maç');
    expect(html).toContain('5,11');
    expect(html).toContain('Tablodan bir hakem seçin');
  });
  it('UEFA tablosu: ülke bayrağı + Türk takımlarının maçları ve hakemleri paneli', () => {
    const uefa: RefereeLeagueTable = {
      ...data,
      league: { id: 2, slug: 'sampiyonlar-ligi', nameKey: 'championsLeague', group: 'uefa', source: 'fixtures' },
      rows: [{ ...line(14808, 'Chris Kavanagh', 'chris-kavanagh-14808', 3, 4), country: { name: 'England', iso2: 'GB', flag: 'https://cdn.sportmonks.com/images/countries/png/short/gb.png' } }],
      trMatches: [{ fixtureId: 19873252, startingAt: '2026-11-03 20:00:00', home: { id: 1, name: 'VfB Stuttgart' }, away: { id: 34, name: 'Galatasaray' }, referee: { id: 14808, name: 'Chris Kavanagh', slug: 'chris-kavanagh-14808' } }],
    };
    const h = renderToStaticMarkup(<RefereeTableView data={uefa} />);
    expect(h).toContain('Şampiyonlar Ligi Hakem İstatistikleri');
    expect(h).toContain('gb.png');
    expect(h).toContain('Türk takımlarının maçları');
    expect(h).toContain('href="/matches/19873252-vfb-stuttgart-galatasaray"');
  });
  it('seçim yokken karşılaştırma ipucu; yorum / vurgu / kumar dili yok', () => {
    expect(html).toContain('Karşılaştırmak için tablodan iki hakem seçin.');
    expect(html).not.toMatch(/en sert|en çok|en az|en yumuşak/i);
    expect(findGamblingTerms(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
});
