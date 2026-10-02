import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TeamMatch } from '@/services/sportmonks/teamOverview';
import RecentMatches from './RecentMatches';
import TeamHeader from './TeamHeader';

function match(i: number, over: Partial<TeamMatch> = {}): TeamMatch {
  return {
    id: 1000 + i,
    status: 'FINISHED',
    time: '',
    date: `2026-09-${String(28 - i).padStart(2, '0')}`,
    scheduled: '17:00',
    home: { id: 34, name: 'Galatasaray' },
    away: { id: 100 + i, name: `Rakip ${i}` },
    scores: { score: '2-1', ft_score: '2-1' },
    competition: i === 2 ? { id: 2, name: 'Champions League', logo: 'ucl.png' } : { id: 600, name: 'Super Lig', logo: 'sl.png' },
    ...over,
  } as TeamMatch;
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('<RecentMatches />', () => {
  it('ilk 10 satır + "Daha fazla"; bitmiş maçta tarih, satırda turnuva etiketi (aria-label + title)', () => {
    const html = renderToStaticMarkup(<RecentMatches matches={Array.from({ length: 25 }, (_, i) => match(i))} loading={false} />);
    expect(count(html, /href="\/matches\//g)).toBe(10);
    expect(html).toContain('Daha fazla');
    expect(html).toContain('>28.09<');
    expect(html).not.toContain('>MS<');
    expect(html).toMatch(/role="img" aria-label="Champions League" title="Champions League"/);
  });

  it('10 ya da daha az maçta düğme yok', () => {
    const html = renderToStaticMarkup(<RecentMatches matches={Array.from({ length: 7 }, (_, i) => match(i))} loading={false} />);
    expect(count(html, /href="\/matches\//g)).toBe(7);
    expect(html).not.toContain('Daha fazla');
  });

  it('yüklenirken aynı kutu, 10 iskelet satırı', () => {
    const html = renderToStaticMarkup(<RecentMatches matches={[]} loading />);
    expect(html).toMatch(/class="_recentList_\w+" aria-busy="true"/);
    expect(count(html, /_recentRow_/g)).toBe(10);
  });
});

describe('<TeamHeader />', () => {
  const lines = (html: string) => html.match(/_headerLine\w+?_/g);
  const props = {
    name: 'Galatasaray',
    standingText: 'Süper Lig · 2. sıra · 13 puan',
    standingLoading: false,
    nextMatch: { opponent: 'Kasımpaşa', when: '9 Ekim Cuma 20:00' },
    compareOpen: false,
    onToggleCompare: () => {},
  };

  it('iskelet ile dolu başlık aynı sabit yükseklikli satırları kullanır', () => {
    const loading = renderToStaticMarkup(<TeamHeader {...props} loading form={[]} />);
    const loaded = renderToStaticMarkup(
      <TeamHeader {...props} loading={false} form={[{ result: 'L', match: match(0) }, { result: 'W', match: match(1) }]} />,
    );
    expect(lines(loading)).toEqual(lines(loaded));
    expect(lines(loaded)).toEqual(['_headerLineName_', '_headerLineMeta_', '_headerLineNext_', '_headerLineForm_']);
  });

  it('form en yeni solda, G/B/M harfleri ve kapsam etiketi', () => {
    const html = renderToStaticMarkup(
      <TeamHeader {...props} loading={false} form={[{ result: 'L', match: match(0) }, { result: 'W', match: match(1) }, { result: 'D', match: match(2) }]} />,
    );
    expect(html.match(/_formPill_\w+ _form(Win|Draw|Loss)_\w+"[^>]*>([GBM])</g)?.map((m) => m.slice(-2, -1))).toEqual(['M', 'G', 'B']);
    expect(html).toContain('Tüm turnuvalar');
    expect(html).toContain('aria-label="Son 3 maçın sonucu, tüm turnuvalar: Mağlubiyet, Galibiyet, Beraberlik"');
  });
});
