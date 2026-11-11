import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/MatchPoll', () => ({ default: () => <div data-testid="poll" /> }));
vi.mock('@/components/MatchForum', () => ({ default: () => <div data-testid="forum" /> }));

import MatchForumTab from './index';

describe('<MatchForumTab />', () => {
  it('varsayılan (arşiv sekmeleri): anket + forum', () => {
    const html = renderToStaticMarkup(<MatchForumTab matchId="1" />);
    expect(html).toContain('data-testid="poll"');
    expect(html).toContain('data-testid="forum"');
  });
  it('showPoll=false (maç detayı): yalnız forum — anket Genel Bakış\'ta, mükerrer değil', () => {
    const html = renderToStaticMarkup(<MatchForumTab matchId="1" showPoll={false} />);
    expect(html).not.toContain('data-testid="poll"');
    expect(html).toContain('data-testid="forum"');
  });
});
