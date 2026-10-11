import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import RedCardBadge, { redCardCountFor } from './index';

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/', asPath: '/', push: vi.fn(), events: { on: vi.fn(), off: vi.fn() } }) }));

import MatchList from '@/components/MatchList';
import LiveTicker from '@/components/LiveTicker';
import MatchCard from '@/components/MatchCard';

const m = (over: Partial<Match> = {}): Match =>
  ({
    id: 19722146,
    status: 'IN PLAY',
    time: "63'",
    date: '2026-10-11',
    scheduled: '15:30',
    home: { id: 8, name: 'Liverpool' },
    away: { id: 9, name: 'Manchester City' },
    competition: { id: 8, name: 'Premier League' },
    scores: { score: '1-1' },
    red_cards: { home: 1, away: 0 },
    ...over,
  }) as Match;

const withQc = (node: React.ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const badges = (html: string) => [...html.matchAll(/role="img" aria-label="([^"]+)"/g)].map((x) => x[1]);

describe('redCardCountFor', () => {
  it('yalnız canlı / devre arası / bitmiş maçta; başlamamışta 0', () => {
    expect(redCardCountFor(m(), 'home')).toBe(1);
    expect(redCardCountFor(m({ status: 'HALF TIME BREAK' }), 'home')).toBe(1);
    expect(redCardCountFor(m({ status: 'FINISHED' }), 'home')).toBe(1);
    expect(redCardCountFor(m({ status: 'NOT STARTED' }), 'home')).toBe(0);
    expect(redCardCountFor(m(), 'away')).toBe(0);
    expect(redCardCountFor(m({ red_cards: undefined }), 'home')).toBe(0);
  });
});

describe('<RedCardBadge />', () => {
  it('1 kart: tek ikon, erişilebilir ad "Kırmızı kart"', () => {
    const html = renderToStaticMarkup(<RedCardBadge count={1} />);
    expect(badges(html)).toEqual(['Kırmızı kart']);
    expect(html.match(/<i /g)).toHaveLength(1);
    expect(html).not.toContain('×');
  });

  it('2 kart: iki ikon; 3+: tek ikon + ×n; 0: hiçbir şey', () => {
    const two = renderToStaticMarkup(<RedCardBadge count={2} />);
    expect(badges(two)).toEqual(['2 kırmızı kart']);
    expect(two.match(/<i /g)).toHaveLength(2);
    const three = renderToStaticMarkup(<RedCardBadge count={3} />);
    expect(three.match(/<i /g)).toHaveLength(1);
    expect(three).toContain('×3');
    expect(renderToStaticMarkup(<RedCardBadge count={0} />)).toBe('');
  });

  it('stil: EventTimeline kartıyla aynı renk (--color-loss), küçülmez (ad kısalır)', () => {
    const scss = readFileSync(join(__dirname, 'redCardBadge.module.scss'), 'utf8');
    expect(scss).toContain('background: var(--color-loss)');
    expect(scss).toMatch(/\.badge \{[^}]*flex-shrink: 0/);
  });
});

describe('yerleşim: kart adın dış tarafında (ad skora bitişik kalır)', () => {
  it('liste satırı: ev sahibinde kart addan ÖNCE, deplasmanda SONRA', () => {
    const html = withQc(
      <MatchList groupedMatches={[{ competition_id: 8, competition_name: 'PL', matches: [m({ red_cards: { home: 1, away: 2 } })] }] as never} />,
    );
    expect(badges(html)).toEqual(['Kırmızı kart', '2 kırmızı kart']);
    const home = html.indexOf('Kırmızı kart');
    expect(home).toBeLessThan(html.indexOf('>Liverpool<'));
    expect(html.indexOf('2 kırmızı kart')).toBeGreaterThan(html.indexOf('>Manchester City<'));
  });

  it('liste satırı: başlamamış maçta kart çizilmez', () => {
    const html = withQc(
      <MatchList groupedMatches={[{ competition_id: 8, competition_name: 'PL', matches: [m({ status: 'NOT STARTED', time: '' })] }] as never} />,
    );
    expect(badges(html)).toEqual([]);
  });

  it('canlı ticker: ev kartı addan önce, deplasman kartı sonra', () => {
    const html = renderToStaticMarkup(<LiveTicker matches={[m({ red_cards: { home: 1, away: 1 } })]} />);
    const labels = [...html.matchAll(/aria-label="Kırmızı kart"/g)].map((x) => x.index!);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toBeLessThan(html.indexOf('>Liverpool<'));
    expect(labels[1]).toBeGreaterThan(html.indexOf('Manchester City<'));
  });

  it('maç başlığı: kart ad kutusunun içinde, mutlak konumlu (ortalanmış ad kaymaz)', () => {
    const html = withQc(<MatchCard match={m({ status: 'FINISHED', red_cards: { home: 0, away: 1 } })} />);
    expect(badges(html)).toEqual(['Kırmızı kart']);
    expect(html).toMatch(/Manchester City<span role="img" aria-label="Kırmızı kart"[^>]*class="[^"]*redCardAway/);
    const scss = readFileSync(join(__dirname, '../MatchCard/matchCard.module.scss'), 'utf8');
    expect(scss).toMatch(/\.redCardAway \{[^}]*position: absolute/);
  });
});
