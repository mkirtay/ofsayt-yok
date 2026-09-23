import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SeasonSelect from './index';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import trMatch from '../../../public/locales/tr/match.json';
import enMatch from '../../../public/locales/en/match.json';

/** Sağlayıcı yokken `lib/i18n` varsayılan dile (tr) düşer — bu testler o çıktıyı doğrular. */

describe('sezon metinleri i18n sözlüğünde', () => {
  it('tr ve en aynı `season` anahtarlarını taşır', () => {
    expect(Object.keys(trMatch.season).sort()).toEqual(['label', 'selectLabel', 'withValue']);
    expect(Object.keys(enMatch.season).sort()).toEqual(Object.keys(trMatch.season).sort());
  });

  it('en çevirileri gerçekten İngilizce (tr ile birebir aynı değil)', () => {
    expect(enMatch.season.label).toBe('Season');
    expect(enMatch.season.label).not.toBe(trMatch.season.label);
    expect(enMatch.season.selectLabel).not.toBe(trMatch.season.selectLabel);
    expect(enMatch.season.withValue).toContain('{{season}}');
  });

  it('standings anahtarları da iki dilde ve farklı', () => {
    expect(Object.keys(enMatch.standings).sort()).toEqual(Object.keys(trMatch.standings).sort());
    expect(enMatch.standings.empty).not.toBe(trMatch.standings.empty);
  });
});

describe('<SeasonSelect />', () => {
  const seasons = [
    { id: 1, name: '2026/2027' },
    { id: 2, name: '2025/2026' },
  ] as never;

  it('etiketi ve aria-label’ı çeviriden basar (ham anahtar sızmaz)', () => {
    const html = renderToStaticMarkup(<SeasonSelect seasons={seasons} value={1} onChange={() => {}} />);
    expect(html).toContain('Sezon');
    expect(html).toContain('aria-label="Sezon seç"');
    expect(html).not.toContain('season.label');
    expect(html).not.toContain('season.selectLabel');
  });

  it('sezon yoksa hiç render etmez', () => {
    expect(renderToStaticMarkup(<SeasonSelect seasons={[]} value={null} onChange={() => {}} />)).toBe('');
  });
});

describe('<MatchCompetitionStandings /> sezon satırı', () => {
  it('seçici yokken "Sezon: <ad>" çeviriyle ve değer yerleştirilmiş basar', () => {
    const html = renderToStaticMarkup(
      <MatchCompetitionStandings
        data={
          {
            competition: { id: 6, name: 'Süper Lig' },
            season: { id: 1, name: '2026/2027' },
            table: [],
          } as never
        }
      />,
    );
    expect(html).toContain('Sezon: 2026-2027');
    expect(html).not.toContain('{{season}}');
    expect(html).not.toContain('season.withValue');
  });
});
