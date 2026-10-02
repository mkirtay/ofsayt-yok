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

  it('teknik direktör / stadyum satırı iskelette de aynı yerde', () => {
    const loading = renderToStaticMarkup(<TeamHeader {...props} loading form={[]} extraLine={<span>…</span>} />);
    const loaded = renderToStaticMarkup(<TeamHeader {...props} loading={false} form={[]} extraLine={<span>Teknik direktör: Okan Buruk</span>} />);
    expect(lines(loading)).toEqual(lines(loaded));
    expect(lines(loaded)).toContain('_headerLineExtra_');
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

describe('<SeasonSummaryCard /> ve <TeamScorersCard />', async () => {
  const { default: SeasonSummaryCard } = await import('./SeasonSummaryCard');
  const { default: TeamScorersCard } = await import('./TeamScorersCard');
  const line = { played: 6, won: 4, drawn: 1, lost: 1, goalsFor: 13, goalsAgainst: 10, cleanSheets: 2 };
  const stats = { seasonId: 1, finished: false, total: line, home: line, away: line, scoredByMinute: [], concededByMinute: [] };
  const tabs = [{ key: 'all', label: 'Tümü' }, { key: '28203', label: 'Süper Lig' }];
  const rows = (html: string) => (html.match(/<tr>/g) ?? []).length;

  it('Sezon Özeti: iskelet ve dolu kart aynı satır sayısı ve alt satır', () => {
    const loading = renderToStaticMarkup(<SeasonSummaryCard loading error={false} tabs={tabs} selected="all" onSelect={() => {}} stats={null} />);
    const loaded = renderToStaticMarkup(
      <SeasonSummaryCard loading={false} error={false} tabs={tabs} selected="all" onSelect={() => {}} stats={stats} footer="Süper Lig: 2. sıra" />,
    );
    expect(rows(loading)).toBe(4);
    expect(rows(loaded)).toBe(4);
    expect(loaded).toContain('>13<');
    expect(loaded).toContain('Süper Lig: 2. sıra');
    expect(loading).toMatch(/_summaryFoot_/);
  });

  it('Takım Krallığı: hep 5 satır (boşlar yer tutar)', () => {
    const html = renderToStaticMarkup(
      <TeamScorersCard loading={false} error={false} scope="Tüm turnuvalar" players={[{ playerId: 1, name: 'Osimhen', goals: 6, assists: 2, apps: 6 }]} />,
    );
    expect((html.match(/_scorerRow_/g) ?? []).length).toBe(5);
    expect(html).toContain('href="/players/1"');
    const loading = renderToStaticMarkup(<TeamScorersCard loading error={false} scope="" players={[]} />);
    expect((loading.match(/_scorerRow_/g) ?? []).length).toBe(5);
  });
});

describe('<ScoringMinutesCard /> ve <SidelinedCard />', async () => {
  const { default: ScoringMinutesCard } = await import('./ScoringMinutesCard');
  const { default: SidelinedCard } = await import('./SidelinedCard');

  it('dakika grafiği: 6 dilim, yalnız CSS çubuklar; iskelette aynı 6 dilim', () => {
    const html = renderToStaticMarkup(
      <ScoringMinutesCard loading={false} error={false} scored={[1, 2, 2, 2, 3, 3]} conceded={[1, 1, 2, 1, 3, 2]} scope="Süper Lig" />,
    );
    expect((html.match(/_minutesGroup_/g) ?? []).length).toBe(6);
    expect(html).toContain('height:100%'); // en yüksek dilim
    expect(html).not.toMatch(/<svg|<canvas/);
    const loading = renderToStaticMarkup(<ScoringMinutesCard loading error={false} scored={[]} conceded={[]} scope="" />);
    expect((loading.match(/_minutesGroup_/g) ?? []).length).toBe(6);
  });

  it('sakat/cezalı: 5 sabit satır, UEFA notu ayrı; 5\'ten fazlasında "Tümü"', () => {
    const p = (id: number, cat: 'injury' | 'suspended') => ({
      playerId: id,
      name: `Oyuncu ${id}`,
      reasons: [{ category: cat, code: cat === 'injury' ? 'MUSCLE_INJURY' : 'RED_CARD_SUSPENSION', name: 'x' }],
      until: '2026-10-14',
    });
    const html = renderToStaticMarkup(
      <SidelinedCard loading={false} error={false} data={{ players: [p(1, 'injury'), p(2, 'suspended')], notInUefaSquad: 6 }} />,
    );
    expect((html.match(/_scorerRow_/g) ?? []).length).toBe(5);
    expect(html).toContain('UEFA kadrosunda değil: 6 oyuncu');
    expect(html).toContain('Kas sakatlığı');
    expect(html).toContain('14.10');
    expect(html).not.toContain('Tümü (');
    const many = renderToStaticMarkup(
      <SidelinedCard loading={false} error={false} data={{ players: [1, 2, 3, 4, 5, 6, 7].map((i) => p(i, 'injury')), notInUefaSquad: 0 }} />,
    );
    expect(many).toContain('Tümü (7)');
    expect((many.match(/href="\/players\//g) ?? []).length).toBe(5);
  });
});
