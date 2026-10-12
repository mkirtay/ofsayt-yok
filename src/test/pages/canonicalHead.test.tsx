/** Detay sayfalarında canonical: tek, sorgusuz, siteBaseUrl() + yol, og:url ile aynı. */
import { describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ query: {} as Record<string, string>, asPath: '/' }));
vi.mock('next/router', () => ({ useRouter: () => ({ ...route, isReady: true }) }));
vi.mock('@/components/TeamDetailView', () => ({ default: () => null }));
vi.mock('@/components/PlayerProfile', () => ({ default: () => null }));
vi.mock('@/components/NewsList', () => ({ default: () => null }));
vi.mock('@/hooks/usePlayerProfile', () => ({ usePlayerProfile: () => ({ data: { name: 'Victor Osimhen', photo: null } }) }));
vi.mock('@/hooks/useNewsDetail', () => ({
  useNewsDetail: () => ({
    isLoading: false,
    isError: false,
    data: { article: { title: 'Başlık', summary: 'Özet', content: '', image: null, source: 'x', publishedAt: '2026-10-12T10:00:00Z' }, sidebarNews: [] },
  }),
}));

import AppDefaultHead from '@/components/AppDefaultHead';
import TeamDetail from '@/pages/teams/[id]';
import PlayerPage from '@/pages/players/[id]';
import NewsDetail from '@/pages/news/[id]';
import { siteBaseUrl } from '@/lib/siteUrl';
import { linkTags, metaTags, renderHeadTags } from '@/test/headTags.testutil';

function headFor(page: React.ReactNode, path: string, query: Record<string, string>) {
  route.asPath = path;
  route.query = query;
  return renderHeadTags(
    <>
      <AppDefaultHead />
      {page}
    </>,
  );
}

function expectCanonical(tags: ReturnType<typeof renderHeadTags>, expected: string) {
  const canon = linkTags(tags, 'canonical');
  expect(canon).toHaveLength(1);
  expect(canon[0]!.props.href).toBe(expected);
  expect(String(expected)).not.toContain('?');
  const ogUrl = metaTags(tags, 'property', 'og:url');
  expect(ogUrl).toHaveLength(1);
  expect(ogUrl[0]!.props.content).toBe(expected);
}

describe('detay sayfalarında canonical', () => {
  it('takım: /teams/34 (sorgu atılır)', () => {
    const tags = headFor(<TeamDetail teamName="Galatasaray" ogImagePath="/api/og/team/34" />, '/teams/34?tab=squad', { id: '34', tab: 'squad' });
    expectCanonical(tags, `${siteBaseUrl()}/teams/34`);
  });

  it('oyuncu: /players/455805', () => {
    const tags = headFor(<PlayerPage />, '/players/455805?x=1', { id: '455805', x: '1' });
    expectCanonical(tags, `${siteBaseUrl()}/players/455805`);
  });

  it('haber: /news/<id>', () => {
    const tags = headFor(<NewsDetail />, '/news/abc123?ref=home', { id: 'abc123', ref: 'home' });
    expectCanonical(tags, `${siteBaseUrl()}/news/abc123`);
  });

  it('canonical kökü getscor3 (siteBaseUrl)', () => {
    expect(siteBaseUrl()).toBe('https://www.getscor3.com');
  });
});
