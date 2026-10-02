import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TeamMatch } from '@/services/sportmonks/teamOverview';
import RecentMatches from './RecentMatches';
import TeamHeaderCard, { type TeamHeaderCardProps } from './TeamHeaderCard';

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

describe('<TeamHeaderCard />', () => {
  const base: TeamHeaderCardProps = {
    loading: false,
    name: 'Galatasaray',
    logo: 'gs.png',
    standing: { competition: 'Süper Lig', competitionLogo: 'sl.png', rank: 2, points: 13 },
    standingLoading: false,
    next: {
      href: '/matches/19746594-galatasaray-kasimpasa',
      opponent: 'Kasımpaşa',
      day: '9 Ekim Cuma',
      time: '20:00',
      competition: 'Süper Lig',
      countdown: 'Bugün 20:00',
      isHome: true,
    },
    live: null,
    form: [
      { result: 'L', match: match(0) },
      { result: 'W', match: match(1) },
      { result: 'D', match: match(2) },
    ],
    coach: 'Okan Buruk',
    venue: { name: 'Rams Park', city: 'İstanbul' },
    compareOpen: false,
    onToggleCompare: () => {},
  };
  // Sabit yükseklikli satırlar (iskelet ile dolu kart aynı kapları kullanmalı).
  const rows = (html: string) => html.match(/_(nameRow|formRow|note|facts|next)_/g);

  it('iskelet ile dolu kart aynı sabit satırları ve sıradaki maç kutusunu kullanır', () => {
    const loading = renderToStaticMarkup(<TeamHeaderCard {...base} loading form={[]} next={null} />);
    const loaded = renderToStaticMarkup(<TeamHeaderCard {...base} />);
    expect(rows(loading)).toEqual(rows(loaded));
    expect(loaded).toContain('<h1');
    expect(loading).not.toContain('_badgeRow_'); // ad gelmeden rozet çizilmez (yatay kayma olmasın)
  });

  it('ad yanında lig rozeti, sıra hapı ve puan; eski metin satırı yok', () => {
    const html = renderToStaticMarkup(<TeamHeaderCard {...base} />);
    expect(html).toContain('Süper Lig');
    expect(html).toMatch(/_rank_\w+"[^>]*>2\.</);
    expect(html).toContain('>13 P<');
    expect(html).not.toContain('2. sıra · 13 puan');
  });

  it('sıradaki maç: maç sayfasına link, "Bugün 20:00", rakip ve iç saha', () => {
    const html = renderToStaticMarkup(<TeamHeaderCard {...base} />);
    expect(html).toContain('href="/matches/19746594-galatasaray-kasimpasa"');
    expect(html).toContain('Bugün 20:00');
    expect(html).toContain('Kasımpaşa');
    expect(html).toContain('İç saha');
    expect(html).toContain('9 Ekim Cuma · 20:00');
  });

  it('canlı maç: kırmızı tonlu kutu, "Canlı · 67\'", skor ve canlı maçın linki', () => {
    const html = renderToStaticMarkup(
      <TeamHeaderCard
        {...base}
        live={{
          href: '/matches/19746594-galatasaray-kasimpasa',
          minute: "67'",
          home: { name: 'Galatasaray' },
          away: { name: 'Kasımpaşa' },
          score: '2-1',
        }}
      />,
    );
    expect(html).toMatch(/class="_next_\w+ _nextLive_\w+"/);
    expect(html).toContain('_liveDot_');
    expect(html).toMatch(/_nextLabel_\w+"><span class="_liveDot_\w+" aria-hidden="true"><\/span>Canlı · 67&#x27;</);
    expect(html).toMatch(/_liveNumbers_\w+">2-1</);
    expect(html).toContain('href="/matches/19746594-galatasaray-kasimpasa"');
    expect(html).not.toContain('Bugün 20:00'); // canlıyken sıradaki maç gösterilmez
  });

  it('form: en yeni solda, en son maç halkalı; harfler ve erişilebilir etiket', () => {
    const html = renderToStaticMarkup(<TeamHeaderCard {...base} />);
    const pills = html.match(/<button[^>]*_pill_[^>]*>[GBM]<\/button>/g) ?? [];
    expect(pills.map((p) => p.slice(-10, -9))).toEqual(['M', 'G', 'B']);
    expect(pills[0]).toContain('_latest_');
    expect(pills[1]).not.toContain('_latest_');
    expect(pills[0]).toMatch(/aria-label="En son maç\. Mağlubiyet: Galatasaray 2-1 Rakip 0, 28\.09\.2026"/);
    expect(html).toContain('Son 3 maç · tüm turnuvalar');
  });

  it('ikonlar aria-hidden; stadyumun şehri title ve aria-label\'da', () => {
    const html = renderToStaticMarkup(<TeamHeaderCard {...base} />);
    expect((html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Stadyum: Rams Park, İstanbul"');
    expect(html).toContain('title="Rams Park, İstanbul"');
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
