import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LeagueFilterBar, { LeaguePickerDialog } from './index';
import { DEFAULT_LEAGUE_FILTER, type CatalogLeague } from '@/utils/leagueFilter';

const noop = () => {};
const catalog: CatalogLeague[] = [
  { id: 600, name: 'Trendyol Süper Lig', known: true },
  { id: 999, name: '2. Lig: Beyaz', country: 'Turkey', known: false },
];

describe('<LeagueFilterBar />', () => {
  it('varsayılan: Tümü aktif, Süper Lig, 5 Büyük Lig, "+ Ligler"; "Liglerim" YOK', () => {
    const html = renderToStaticMarkup(
      <LeagueFilterBar state={DEFAULT_LEAGUE_FILTER} catalog={catalog} onSelectMode={noop} onApplyCustom={noop} />,
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tümü</);
    expect(html).toContain('Süper Lig');
    expect(html).toContain('5 Büyük Lig');
    expect(html).toContain('Ligler');
    expect(html).not.toContain('Liglerim');
  });

  it('kayıtlı özel seçim varken "Liglerim (n)" görünür; ASLA "Favorilerim" adı kullanılmaz', () => {
    const html = renderToStaticMarkup(
      <LeagueFilterBar
        state={{ mode: 'custom', custom: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' }] }}
        catalog={catalog}
        onSelectMode={noop}
        onApplyCustom={noop}
      />,
    );
    expect(html).toContain('Liglerim (4)');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Liglerim \(4\)</);
    expect(html).not.toMatch(/Favorilerim/i);
  });

  it('panel: modal dialog, aranabilir, checkbox\'lı liste; önceki seçim işaretli', () => {
    const html = renderToStaticMarkup(
      <LeaguePickerDialog catalog={catalog} initial={[{ id: 999, name: '2. Lig: Beyaz' }]} onClose={noop} onApply={noop} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('type="search"');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain('Uygula (1)');
  });

  it('her satırda lig logosu: checkbox\'ın hemen ardından, isimden ÖNCE; logosu olmayan satırda nötr placeholder', () => {
    const withLogo: CatalogLeague[] = [
      { id: 600, name: 'Trendyol Süper Lig', known: true, logo: 'https://cdn.sportmonks.com/images/soccer/leagues/24/600.png' },
      { id: 999, name: '2. Lig: Beyaz', country: 'Turkey', known: false },
    ];
    const html = renderToStaticMarkup(<LeaguePickerDialog catalog={withLogo} initial={[]} onClose={noop} onApply={noop} />);
    const rows = [...html.matchAll(/<label[^>]*>.*?<\/label>/g)].map((m) => m[0]);
    expect(rows).toHaveLength(2);
    // sıra: checkbox → logo → isim
    expect(rows[0].indexOf('type="checkbox"')).toBeLessThan(rows[0].indexOf('<img'));
    expect(rows[0].indexOf('<img')).toBeLessThan(rows[0].indexOf('Trendyol Süper Lig'));
    expect(rows[0]).toContain('leagues/24/600.png');
    // logosuz satır: <img> yok, placeholder daire var (kırık görsel yok)
    expect(rows[1]).not.toContain('<img');
    expect(rows[1]).toContain('border-radius:50%');
  });
});
