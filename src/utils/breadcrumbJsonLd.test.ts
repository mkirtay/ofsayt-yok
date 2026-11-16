import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd } from './breadcrumbJsonLd';

describe('breadcrumbJsonLd', () => {
  it('site kökü ilk öğe; boş adlı öğe atlanır ve konumlar ardışık', () => {
    const j = breadcrumbJsonLd([
      { name: 'Süper Lig', url: 'https://x/lig/super-lig' },
      { name: '', url: 'https://x/bos' },
      { name: 'A - B', url: 'https://x/matches/1-a-b' },
    ]) as { itemListElement: { position: number; name: string; item: string }[] };
    expect(j.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(j.itemListElement[1]).toMatchObject({ name: 'Süper Lig', item: 'https://x/lig/super-lig' });
    expect(j.itemListElement[2]!.name).toBe('A - B');
  });
});
