import { describe, expect, it } from 'vitest';
import countries from '@/services/apiFootball/__fixtures__/countries.json';
import { nationalTeamNameTr } from './nationalTeamNames';

describe('nationalTeamNameTr', () => {
  it('özel durumlar', () => {
    expect(nationalTeamNameTr('FYR Macedonia')).toBe('Kuzey Makedonya');
    expect(nationalTeamNameTr('Czechia')).toBe('Çekya');
    expect(nationalTeamNameTr('Czech-Republic')).toBe('Çekya');
    expect(nationalTeamNameTr('Turkey')).toBe('Türkiye');
    expect(nationalTeamNameTr('Türkiye')).toBe('Türkiye');
    expect(nationalTeamNameTr('USA')).toBe('ABD');
    expect(nationalTeamNameTr('Congo DR')).toBe('Kongo DC');
    expect(nationalTeamNameTr('Bosnia & Herzegovina')).toBe('Bosna-Hersek');
    expect(nationalTeamNameTr('Italy')).toBe('İtalya');
  });

  it('AF `countries` listesindeki hiçbir ad İngilizce kalmaz (ad ISO adıyla aynı olanlar hariç)', () => {
    const tr = new Intl.DisplayNames(['tr'], { type: 'region' });
    const stuck: string[] = [];
    for (const c of (countries as { response?: Array<{ name: string; code: string | null }> }).response ?? (countries as unknown as Array<{ name: string; code: string | null }>)) {
      if (!c.code || !/^[A-Z]{2}$/.test(c.code)) continue;
      const out = nationalTeamNameTr(c.name);
      // Aynı yazılan adlar (Panama, Kuba...) meşru; fark ancak ISO'nun Türkçesi farklıysa sorun.
      const expected = tr.of(c.code);
      if (out === c.name && expected && expected !== c.name && expected !== c.code) stuck.push(`${c.name} → ${expected}`);
    }
    expect(stuck).toEqual([]);
  });
});
