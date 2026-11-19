import { describe, expect, it } from 'vitest';
import { accuracyDatasetJsonLd, itemListJsonLd, matchListJsonLd, webGameJsonLd } from './listJsonLd';

describe('listJsonLd', () => {
  it('ItemList: konumlar 1\'den, ad + adres', () => {
    const j = itemListJsonLd('Ligler', [
      { name: 'Süper Lig', url: 'https://x/lig/super-lig' },
      { name: 'La Liga', url: 'https://x/lig/la-liga' },
    ]) as { numberOfItems: number; itemListElement: { position: number; name: string }[] };
    expect(j.numberOfItems).toBe(2);
    expect(j.itemListElement.map((e) => [e.position, e.name])).toEqual([[1, 'Süper Lig'], [2, 'La Liga']]);
  });

  it('maç listesi: TSİ ofsetli başlama, saat yoksa yalnız tarih', () => {
    const j = matchListJsonLd('Bugün', '2026-11-21', [
      { href: '/matches/1-a-b', home: { name: 'A' }, away: { name: 'B' }, competition: { name: 'Süper Lig' }, time: '16:00' },
      { href: '/matches/2-c-d', home: { name: 'C' }, away: { name: 'D' }, competition: { name: '' } },
    ]) as { itemListElement: { item: Record<string, unknown> }[] };
    expect(j.itemListElement[0]!.item.startDate).toBe('2026-11-21T16:00:00+03:00');
    expect(j.itemListElement[0]!.item.name).toBe('A - B');
    expect(j.itemListElement[1]!.item.startDate).toBe('2026-11-21');
    expect(j.itemListElement[1]!.item).not.toHaveProperty('superEvent');
  });

  it('isabet veri seti: kapsam aylardan, dateModified son değerlendirmeden', () => {
    const j = accuracyDatasetJsonLd({
      name: 'n', description: 'd', url: 'u',
      months: [{ month: '2026-11', matches: 1, picks: 3, hits: 2, rate: 67 }, { month: '2026-10', matches: 2, picks: 6, hits: 3, rate: 50 }],
      lastEvaluatedAt: '2026-11-19T03:00:00.000Z',
    });
    expect(j.temporalCoverage).toBe('2026-10/2026-11');
    expect(j.dateModified).toBe('2026-11-19');
    expect(j['@type']).toBe('Dataset');
  });

  it('oyun: ücretsiz VideoGame', () => {
    expect(webGameJsonLd({ name: 'Frikik', description: 'd', url: 'u' })).toMatchObject({ '@type': 'VideoGame', isAccessibleForFree: true });
  });
});
