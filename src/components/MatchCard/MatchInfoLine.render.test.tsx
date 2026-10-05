import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import MatchInfoLine, { CoachLink, infoItemKeys } from './MatchInfoLine';

const base = { id: 1, status: 'NOT STARTED', time: '', home: { id: 34, name: 'Galatasaray' }, away: { id: 1071, name: 'Kasımpaşa' } } as Match;
const items = (html: string) => [...html.matchAll(/data-info="([a-z]+)"/g)].map((m) => m[1]);

describe('<MatchInfoLine /> (saat altındaki kompakt bilgi satırı)', () => {
  it('başlamamış maç: Stadyum · Hakem · Nerede İzlenir — ikon + değer, başlık yalnız ekran okuyucuya; TD yok', () => {
    const html = renderToStaticMarkup(
      <MatchInfoLine
        match={{ ...base, tv_stations: ['TOD', 'beIN CONNECT Turkey'], coaches: { home: 'O. Buruk', away: 'E. Belözoğlu' }, weather: { tempC: 18, condition: 'clear' } }}
        phase="PRE"
        location="RAMS Park"
        refereeText="Açıklanmadı"
      />,
    );
    expect(items(html)).toEqual(['stadium', 'referee', 'tv']); // yayıncı varken hava yok
    expect(html).toContain('TOD, beIN CONNECT Turkey');
    expect(html).not.toContain('Teknik Direktörler');
    expect(html).not.toContain('O. Buruk');
    expect(html.match(/<li [^>]*><svg/g)).toHaveLength(3);
    expect(html).toMatch(/Stadyum: <\/span><span[^>]*>RAMS Park/);
  });

  it('hakem istatistik düğmesi korunur', () => {
    const html = renderToStaticMarkup(
      <MatchInfoLine match={base} phase="POST" location="" refereeText="A. Kaya" refereeToggle={{ open: false, controlsId: 'referee-stats-1', onToggle: () => {} }} />,
    );
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="referee-stats-1"[^>]*>A\. Kaya<\/button>/);
  });

  it('bitmiş maç: yayıncı yerine hava; hiç veri yoksa bileşen boş', () => {
    const html = renderToStaticMarkup(
      <MatchInfoLine match={{ ...base, status: 'FINISHED', tv_stations: ['beIN Sports 1'], weather: { tempC: 22, condition: 'cloudy' } }} phase="POST" location="RAMS Park" refereeText="" />,
    );
    expect(items(html)).toEqual(['stadium', 'weather']);
    expect(html).toContain('22°C, Bulutlu');
    expect(renderToStaticMarkup(<MatchInfoLine match={base} phase="POST" location="" refereeText="" />)).toBe('');
  });

  it('öğe seçimi: canlıda yayıncı, yayıncı yoksa hava; boş stadyum / hakem yok', () => {
    expect(infoItemKeys({ ...base, tv_stations: ['TOD'], weather: { tempC: 9 } } as Match, 'LIVE', ' ', 'X')).toEqual(['referee', 'tv']);
    expect(infoItemKeys({ ...base, weather: { tempC: 9 } } as Match, 'PRE', 'Arena', '')).toEqual(['stadium', 'weather']);
  });

  it('teknik direktör linki tam adla; id yoksa düz metin; ad yoksa hiçbir şey', () => {
    expect(renderToStaticMarkup(<CoachLink name="O. Buruk" id={199988} full="Okan Buruk" />)).toMatch(
      /<a [^>]*href="\/teknik-direktor\/okan-buruk-199988"[^>]*>O\. Buruk<\/a>/,
    );
    expect(renderToStaticMarkup(<CoachLink name="E. Belözoğlu" />)).toMatch(/<span[^>]*>E\. Belözoğlu<\/span>/);
    expect(renderToStaticMarkup(<CoachLink />)).toBe('');
  });

  it('stil: container query ile genişte "·" ayraçlı tek satır, darda ayraçsız sarar', () => {
    const scss = readFileSync(join(process.cwd(), 'src/components/MatchCard/matchInfo.module.scss'), 'utf8');
    expect(scss).toMatch(/container-type:\s*inline-size/);
    expect(scss).toMatch(/flex-wrap: wrap/);
    expect(scss).toMatch(/@container \(min-width: 480px\)\s*{\s*& \+ &::before\s*{\s*content: '·';/);
  });
});
