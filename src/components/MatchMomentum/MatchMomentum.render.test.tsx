import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';
import type { MatchMomentumResponse } from '@/services/sportmonks/momentum';
import MatchMomentum, { MomentumChart } from './index';

// Gerçek i18n: provider yokken varsayılan dil TR, TR `match` sözlüğü modül yüklenince kayıtlı.
const match = (status: string, over: Partial<Match> = {}) =>
  ({ id: 1, status, home: { id: 286, name: 'Gençlerbirliği' }, away: { id: 34, name: 'Galatasaray' }, ...over }) as unknown as Match;

const ev = (over: Partial<MatchEvent>): MatchEvent => ({
  id: 1,
  player: { id: 1, name: 'İrfan Can' },
  time: 88,
  event: 'GOAL',
  sort: 88,
  info: null,
  addition: null,
  is_home: false,
  is_away: true,
  ...over,
});

const data: MatchMomentumResponse = {
  points: [...Array.from({ length: 46 }, (_, i) => (i % 10) * 10), ...Array.from({ length: 50 }, (_, i) => -(i % 10) * 10)],
  segments: [
    { from: 0, length: 46, start: 0, played: 46 },
    { from: 45, length: 50, start: 46, played: 50 },
  ],
  live: false,
  colors: null,
};

describe('MatchMomentum', () => {
  it('maç öncesinde hiç çizilmez (yer ayrılmaz)', () => {
    expect(renderToStaticMarkup(<MatchMomentum matchId="1" match={match('NOT STARTED')} events={[]} />)).toBe('');
    expect(renderToStaticMarkup(<MatchMomentum matchId="1" match={null} events={[]} />)).toBe('');
  });

  it('ertelenen / iptal maçta çizilmez', () => {
    expect(renderToStaticMarkup(<MatchMomentum matchId="1" match={match('NOT STARTED', { state_code: 'POSTPONED' })} events={[]} />)).toBe('');
  });

  it.each(['IN PLAY', 'HALF TIME BREAK', 'FINISHED'])('%s: ilk HTML\'de sabit yükseklikli iskelet (CLS yok)', (status) => {
    const html = renderToStaticMarkup(<MatchMomentum matchId="1" match={match(status)} events={[]} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Maç baskısı');
  });
});

describe('MomentumChart', () => {
  const html = renderToStaticMarkup(
    <MomentumChart
      data={data}
      homeName="Gençlerbirliği"
      awayName="Galatasaray"
      events={[ev({}), ev({ id: 2, event: 'RED_CARD', time: 30, is_home: true, is_away: false }), ev({ id: 3, event: 'YELLOW_CARD' })]}
    />,
  );

  it('iki alan yolu (ev üst / deplasman alt), devre bantları, sıfır çizgisi', () => {
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html.match(/<rect /g)).toHaveLength(2);
    expect(html).toContain('<line');
    expect(html).toContain('role="img"');
    expect(html).toContain('Gençlerbirliği üstte, Galatasaray altta');
  });

  it('gol + kırmızı kart işaretlenir, sarı kart işaretlenmez', () => {
    expect(html).toContain("title=\"88&#x27; Gol · İrfan Can\"");
    expect(html).toContain("title=\"30&#x27; Kırmızı kart · İrfan Can\"");
    expect(html.match(/title="/g)).toHaveLength(2);
  });

  it('forma renkleri CSS değişkeni olarak; renk yoksa stil yok (token)', () => {
    expect(html).not.toContain('--mm-home');
    const colored = renderToStaticMarkup(
      <MomentumChart
        data={{ ...data, colors: { home: { fill: '#c40010', edge: { light: null, dark: null } }, away: { fill: '#f0f0f0', edge: { light: '#8a8a8a', dark: null } } } }}
        homeName="A"
        awayName="B"
        events={[]}
      />,
    );
    expect(colored).toContain('--mm-home:#c40010');
    expect(colored).toContain('--mm-away-edge-l:#8a8a8a');
    expect(colored).not.toContain('--mm-away-edge-d');
  });

  it('eksen etiketleri: 0\', 45\', 90\'', () => {
    for (const l of ["0&#x27;", "45&#x27;", "90&#x27;"]) expect(html).toContain(`>${l}</span>`);
  });
});
