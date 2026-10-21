import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fixture from '@/services/sportmonks/__fixtures__/teamOfTheWeek600.json';
import { mapTeamOfTheWeek, type RawTotwRow } from '@/services/sportmonks/teamOfTheWeek';
import TeamOfTheWeek from './index';

const data = mapTeamOfTheWeek(600, fixture.data as RawTotwRow[], Date.parse('2026-10-21T12:00:00Z'))!;

describe('<TeamOfTheWeek />', () => {
  const html = renderToStaticMarkup(<TeamOfTheWeek data={data} leagueName="Süper Lig" />);

  it('başlık, tur, tarih, diziliş', () => {
    expect(html).toContain("Haftanın 11&#x27;i");
    expect(html).toContain('Süper Lig · 7. Hafta · 9–12 Eki');
    expect(html).toContain('4-4-2');
  });

  it('11 oyuncu, oyuncu sayfasına bağlı, puan rozeti ve takım logosu', () => {
    expect((html.match(/data-testid="totw-player"/g) ?? []).length).toBe(11);
    expect(html).toContain('href="/players/108695"');
    expect(html).toContain('A. Gianniotis');
    expect(html).toContain('aria-label="Puan 8.3"');
  });

  it('haftanın oyuncusu en yüksek puan (André Henrique 9.04; 8.97 de 9.0 görünür)', () => {
    expect(html).toContain('Haftanın oyuncusu: André Henrique (Göztepe) · 9.0');
  });

  it('dizilişi çözülemezse hiçbir şey çizmez', () => {
    expect(renderToStaticMarkup(<TeamOfTheWeek data={{ ...data, formation: '4-4-3' }} leagueName="x" />)).toBe('');
  });
});
