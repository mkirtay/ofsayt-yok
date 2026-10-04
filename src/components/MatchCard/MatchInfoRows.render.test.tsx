import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import MatchInfoRows from './MatchInfoRows';

const base = { id: 1, status: 'NOT STARTED', time: '', home: { id: 34, name: 'Galatasaray' }, away: { id: 1071, name: 'Kasımpaşa' } } as Match;

describe('<MatchInfoRows /> (bilgi kartı ek satırları)', () => {
  it('başlamamış maç: nerede izlenir + teknik direktörler; hava yoksa satır yok', () => {
    const html = renderToStaticMarkup(
      <MatchInfoRows match={{ ...base, tv_stations: ['TOD', 'beIN CONNECT Turkey'], coaches: { home: 'O. Buruk', away: 'E. Belözoğlu' } }} phase="PRE" />,
    );
    expect(html).toContain('Nerede izlenir');
    expect(html).toContain('TOD, beIN CONNECT Turkey');
    expect(html).toContain('Teknik direktörler');
    expect(html).toContain('O. Buruk');
    expect(html).not.toContain('data-info="weather"');
    // id varsa teknik direktör sayfasına link
    const linked = renderToStaticMarkup(<MatchInfoRows match={{ ...base, coaches: { home: 'O. Buruk', homeId: 199988, homeFull: 'Okan Buruk', away: 'E. Belözoğlu' } }} phase="PRE" />);
    expect(linked).toContain('href="/teknik-direktor/okan-buruk-199988"');
    expect(linked).toContain('>O. Buruk</a>');
    expect(linked).not.toContain('href="/teknik-direktor/e-belozoglu');
  });

  it('bitmiş maç: yayıncı satırı gösterilmez; hava "22°C, Bulutlu"', () => {
    const html = renderToStaticMarkup(
      <MatchInfoRows match={{ ...base, status: 'FINISHED', tv_stations: ['beIN Sports 1'], weather: { tempC: 22, condition: 'cloudy' } }} phase="POST" />,
    );
    expect(html).not.toContain('data-info="tv"');
    expect(html).toContain('22°C, Bulutlu');
  });

  it('canlı maçta yayıncı satırı var; hiç veri yoksa bileşen boş', () => {
    expect(renderToStaticMarkup(<MatchInfoRows match={{ ...base, tv_stations: ['TOD'] }} phase="LIVE" />)).toContain('data-info="tv"');
    expect(renderToStaticMarkup(<MatchInfoRows match={base} phase="PRE" />)).toBe('');
  });
});
