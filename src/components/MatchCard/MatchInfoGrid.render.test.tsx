import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import MatchInfoGrid, { infoCellKeys } from './MatchInfoGrid';

const base = { id: 1, status: 'NOT STARTED', time: '', home: { id: 34, name: 'Galatasaray' }, away: { id: 1071, name: 'Kasımpaşa' } } as Match;
const cells = (html: string) => [...html.matchAll(/data-info="([a-z]+)"/g)].map((m) => m[1]);

describe('<MatchInfoGrid /> (bilgi kartı hücreleri)', () => {
  it('başlamamış maç: Stadyum · Hakem · Teknik Direktörler · Nerede İzlenir — hepsi aynı hücre yapısında', () => {
    const html = renderToStaticMarkup(
      <MatchInfoGrid
        match={{ ...base, tv_stations: ['TOD', 'beIN CONNECT Turkey'], coaches: { home: 'O. Buruk', away: 'E. Belözoğlu' }, weather: { tempC: 18, condition: 'clear' } }}
        phase="PRE"
        location="RAMS Park"
        refereeText="Açıklanmadı"
      />,
    );
    expect(cells(html)).toEqual(['stadium', 'referee', 'coaches', 'tv']); // yayıncı varken 4. hücre "Nerede İzlenir"
    expect(html).toContain('Nerede İzlenir');
    expect(html).toContain('TOD, beIN CONNECT Turkey');
    expect(html).toContain('Teknik Direktörler');
    expect(html).toContain('data-count="4"');
    // Her hücre: dt (ikon + başlık) + dd (değer)
    expect(html.match(/<dt class="[^"]*"><svg/g)).toHaveLength(4);
    expect(html.match(/<dd /g)).toHaveLength(4);
    // İki teknik direktör alt alta (ayrı satırlar)
    expect(html).toMatch(/O\. Buruk<\/span><span[^>]*>E\. Belözoğlu/);
  });

  it('TD linkleri ve hakem istatistik düğmesi korunur', () => {
    const html = renderToStaticMarkup(
      <MatchInfoGrid
        match={{ ...base, coaches: { home: 'O. Buruk', homeId: 199988, homeFull: 'Okan Buruk', away: 'E. Belözoğlu' } }}
        phase="POST"
        location=""
        refereeText="A. Kaya"
        refereeToggle={{ open: false, controlsId: 'referee-stats-1', onToggle: () => {} }}
      />,
    );
    expect(html).toContain('href="/teknik-direktor/okan-buruk-199988"');
    expect(html).toContain('>O. Buruk</a>');
    expect(html).not.toContain('href="/teknik-direktor/e-belozoglu');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="referee-stats-1"[^>]*>A\. Kaya<\/button>/);
  });

  it('bitmiş maç: yayıncı yerine hava; veri olmayan hücre çizilmez, hiç veri yoksa bileşen boş', () => {
    const html = renderToStaticMarkup(
      <MatchInfoGrid match={{ ...base, status: 'FINISHED', tv_stations: ['beIN Sports 1'], weather: { tempC: 22, condition: 'cloudy' } }} phase="POST" location="RAMS Park" refereeText="" />,
    );
    expect(cells(html)).toEqual(['stadium', 'weather']);
    expect(html).toContain('22°C, Bulutlu');
    expect(renderToStaticMarkup(<MatchInfoGrid match={base} phase="POST" location="" refereeText="" />)).toBe('');
  });

  it('hücre seçimi: canlıda yayıncı, yayıncı yoksa hava; boş stadyum / hakem yok', () => {
    expect(infoCellKeys({ ...base, tv_stations: ['TOD'], weather: { tempC: 9 } } as Match, 'LIVE', ' ', 'X')).toEqual(['referee', 'tv']);
    expect(infoCellKeys({ ...base, weather: { tempC: 9 } } as Match, 'PRE', 'Arena', '')).toEqual(['stadium', 'weather']);
  });

  it('stil: container query ile genişte tek satır, darda 2×2; tek kalan hücre satırı kaplar', () => {
    const scss = readFileSync(join(process.cwd(), 'src/components/MatchCard/matchInfo.module.scss'), 'utf8');
    expect(scss).toMatch(/container-type:\s*inline-size/);
    expect(scss).toMatch(/@container \(min-width: 480px\)/);
    expect(scss).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(scss).toMatch(/&:last-child:nth-child\(odd\)\s*{\s*grid-column: 1 \/ -1;/);
  });
});
