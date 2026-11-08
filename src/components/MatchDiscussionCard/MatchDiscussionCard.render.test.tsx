import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GundemPost } from '@/types/gundem';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const state = { inView: true, feed: { isPending: false, isError: false, data: undefined as unknown } };
const feedSpy = vi.fn();
vi.mock('@/hooks/useInViewOnce', () => ({ useInViewOnce: () => [() => {}, state.inView] }));
vi.mock('@/hooks/useGundem', () => ({
  useGundemFeed: (...args: unknown[]) => {
    feedSpy(...args);
    return state.feed;
  },
}));

import MatchDiscussionCard from './index';

function post(id: string, body: string, username: string | null): GundemPost {
  return {
    id,
    body,
    createdAt: new Date().toISOString(),
    authorType: 'USER',
    matchId: '9',
    match: null,
    teamId: null,
    author: { id: 'u' + id, name: 'Ad', username, image: null, official: false, followedByMe: false, followerCount: 0, followingCount: 0 },
    likes: 0,
    comments: 0,
    likedByMe: false,
  };
}

const render = () => renderToStaticMarkup(<MatchDiscussionCard matchId="9" onJoin={() => {}} />);

beforeEach(() => {
  state.inView = true;
  state.feed = { isPending: false, isError: false, data: undefined };
  feedSpy.mockClear();
});

describe('<MatchDiscussionCard />', () => {
  it('görünür olmadan forum akışı istenmez (iskelet)', () => {
    state.inView = false;
    const html = render();
    expect(feedSpy).toHaveBeenCalledWith('all', expect.objectContaining({ matchId: '9', enabled: false }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('discussion.title');
  });

  it('yorum yoksa "ilk yorumu sen yaz" + "Yorum yaz" düğmesi', () => {
    state.feed.data = { pages: [{ items: [], nextCursor: null }] };
    const html = render();
    expect(html).toContain('discussion.empty');
    expect(html).toContain('discussion.write');
  });

  it('en çok 2 gönderi önizlemesi + "Tartışmaya katıl"', () => {
    state.feed.data = {
      pages: [{ items: [post('1', 'Birinci yorum', 'ali'), post('2', 'İkinci', null), post('3', 'Üçüncü', 'veli')], nextCursor: null }],
    };
    const html = render();
    expect(html).toContain('@ali');
    expect(html).toContain('Birinci yorum');
    expect(html).toContain('İkinci');
    expect(html).not.toContain('Üçüncü');
    expect(html).toContain('discussion.join');
    // Kart toplam yorum sayısı göstermez (sayılar yalnız admin rozetinde).
    expect(html).not.toMatch(/💬\s*\d/);
  });
});
