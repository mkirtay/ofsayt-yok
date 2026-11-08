import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
vi.mock('@/components/MatchPoll', () => ({ default: (p: { locked: boolean }) => <div data-testid="poll" data-locked={String(p.locked)} /> }));
vi.mock('@/components/MatchForum', () => ({ default: (p: { layout?: string }) => <div data-testid="forum" data-layout={p.layout} /> }));
const feed = { data: undefined as unknown, hasNextPage: false };
vi.mock('@/hooks/useGundem', () => ({ useGundemFeed: () => feed }));
const counters = { value: null as null | Record<string, { views: number; comments: number }> };
vi.mock('@/hooks/useMatchCounters', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useMatchCounters')>()),
  useMatchCounters: () => counters.value,
}));
vi.mock('@/components/MatchCountersBadge', () => ({ default: () => <span data-testid="match-counters" /> }));

import MatchChatPanel, { formatCountdown } from './MatchChatPanel';
import MatchChatPanelSlot from './index';

const t = (k: string, o?: Record<string, unknown>) => `${k}:${JSON.stringify(o)}`;

function match(status: string, extra: Partial<Match> = {}): Match {
  return { id: 9, status, date: '2026-11-08', scheduled: '18:00', home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' }, ...extra } as unknown as Match;
}

beforeEach(() => {
  feed.data = undefined;
  feed.hasNextPage = false;
  counters.value = null;
});

describe('formatCountdown', () => {
  it('gün/saat/dakika ve son saatte dk:sn', () => {
    expect(formatCountdown(2 * 86400_000 + 4 * 3600_000, t)).toBe('chat.dh:{"d":2,"h":4}');
    expect(formatCountdown(3 * 3600_000 + 12 * 60_000, t)).toBe('chat.hm:{"h":3,"m":12}');
    expect(formatCountdown(12 * 60_000 + 5_000, t)).toBe('12:05');
    expect(formatCountdown(-5, t)).toBe('00:00');
  });
});

describe('<MatchChatPanelSlot />', () => {
  it('SSR: yalnız boş yuva (içerik/istek yok → LCP adayı değil, CDN HTML değişmez)', () => {
    const html = renderToStaticMarkup(<MatchChatPanelSlot matchId="9" match={null} />);
    expect(html).toMatch(/^<aside[^>]*data-testid="match-chat-slot"[^>]*><\/aside>$/);
  });
});

describe('<MatchChatPanel />', () => {
  it('anket + sohbet düzeninde forum; admin değilse sayaç rozeti yok', () => {
    const html = renderToStaticMarkup(<MatchChatPanel matchId="9" match={match('NOT STARTED')} />);
    expect(html).toContain('chat.title');
    expect(html).toContain('data-testid="poll"');
    expect(html).toContain('data-layout="chat"');
    expect(html).not.toContain('match-counters');
  });

  it('yorum sayısı yüklenen akıştan; devamı varsa "+"', () => {
    feed.data = { pages: [{ items: [{}, {}, {}] }] };
    feed.hasNextPage = true;
    const html = renderToStaticMarkup(<MatchChatPanel matchId="9" match={null} />);
    expect(html).toContain('chat.commentCount:{&quot;count&quot;:3,&quot;plus&quot;:&quot;+&quot;}');
  });

  it('admin: başlıkta sayaç rozeti', () => {
    counters.value = { '9': { views: 5, comments: 1 } };
    expect(renderToStaticMarkup(<MatchChatPanel matchId="9" match={null} />)).toContain('match-counters');
  });

  it('canlı: dakika + skor; bitti: "Maç bitti" + skor; anket kilitli', () => {
    const live = renderToStaticMarkup(
      <MatchChatPanel matchId="9" match={match('IN PLAY', { time: '67', scores: { score: '2 - 1' } } as Partial<Match>)} />,
    );
    expect(live).toContain("67&#x27;");
    expect(live).toContain('2 - 1');
    expect(live).toContain('data-locked="true"');
    const done = renderToStaticMarkup(<MatchChatPanel matchId="9" match={match('FINISHED', { scores: { score: '0 - 3' } } as Partial<Match>)} />);
    expect(done).toContain('chat.finished');
    expect(done).toContain('0 - 3');
  });
});
