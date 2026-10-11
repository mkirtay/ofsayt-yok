import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/', asPath: '/', push: vi.fn() }) }));

import MatchList, { type MatchListInlineSlot } from './index';

const match = (id: number): Match =>
  ({ id, status: 'NOT STARTED', time: '', date: '2026-10-11', scheduled: '17:00', home: { id: id * 10, name: `Ev ${id}` }, away: { id: id * 10 + 1, name: `Dep ${id}` } }) as Match;
const group = (competition_id: number, ...ids: number[]) => ({ competition_id, competition_name: `Lig ${competition_id}`, matches: ids.map(match) });
const SLOT: MatchListInlineSlot = { node: <div data-testid="slot">KART</div>, height: 100 };

const render = (props: Parameters<typeof MatchList>[0]) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MatchList fitContent {...props} />
    </QueryClientProvider>,
  );

/** Satırların (react-window, absolute) dikey konumu ve türü, çizim sırasıyla. */
const rows = (html: string) =>
  html
    .split('role="listitem"')
    .slice(1)
    .map((chunk) => ({
      top: Number(/translateY\((\d+)px\)/.exec(chunk)![1]),
      kind: chunk.includes('data-testid="slot"') ? 'slot' : chunk.includes('data-competition-id') ? `header:${/data-competition-id="(\d+)"/.exec(chunk)![1]}` : 'match',
    }));

describe('MatchList — ilk grubun ardındaki slot', () => {
  it('ilk lig grubunun son maçından sonra, ikinci grup başlığından önce; sonraki başlıkta ayrıca boşluk yok', () => {
    const html = render({ groupedMatches: [group(600, 1, 2), group(8, 3)] as never, afterFirstGroup: SLOT });
    const r = rows(html);
    expect(r.map((x) => x.kind)).toEqual(['header:600', 'match', 'match', 'slot', 'header:8', 'match']);
    // başlık 44 + 2 × 40 = 124 → slot; 12 (grup boşluğu) + 100 → sonraki başlık 236'da (boşluksuz 44)
    expect(r[3]!.top).toBe(124);
    expect(r[4]!.top).toBe(236);
    expect(r[5]!.top).toBe(280);
    expect(html).toContain('--list-content-h:320px');
  });

  it('tek grupta en sonda; slot verilmezse liste aynen', () => {
    expect(rows(render({ groupedMatches: [group(600, 1)] as never, afterFirstGroup: SLOT })).map((x) => x.kind)).toEqual(['header:600', 'match', 'slot']);
    expect(render({ groupedMatches: [group(600, 1), group(8, 3)] as never })).not.toContain('data-testid="slot"');
  });

  it('gün gruplu (fikstür) modda da ilk günün ardında', () => {
    const html = render({
      dateGroups: [
        { date: '2026-10-11', label: 'Bugün', matches: [match(1)] },
        { date: '2026-10-12', label: 'Yarın', matches: [match(2)] },
      ],
      afterFirstGroup: SLOT,
    });
    expect(html.indexOf('data-testid="slot"')).toBeGreaterThan(html.indexOf('Ev 1'));
    expect(html.indexOf('data-testid="slot"')).toBeLessThan(html.indexOf('Yarın'));
  });

  it('liste boşsa slot boş mesajın altında', () => {
    const html = render({ groupedMatches: [], afterFirstGroup: SLOT });
    expect(html).not.toContain('role="list"');
    expect(html.indexOf('data-testid="slot"')).toBeGreaterThan(html.indexOf('_empty_'));
  });
});
