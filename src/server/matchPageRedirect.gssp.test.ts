import { describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import type { Match } from '@/models/liveScore';

// Eski slug kuralıyla ("s-o-paulo-santos") ya da slug'sız gelen maç adresi → kanonik adrese 301 (sorgu korunur).
vi.mock('@/services/sportmonksProviderFlag', () => ({ isSportmonksProviderEnabled: () => true, toStandingsCompetitionId: (id: unknown) => id }));
vi.mock('@/server/resolveMatchPage', () => ({
  resolveMatchPage: async () => ({
    kind: 'match',
    match: { id: 19621877, status: 'FINISHED', home: { id: 1, name: 'São Paulo' }, away: { id: 2, name: 'Santos' } } as unknown as Match,
    events: [],
  }),
}));
vi.mock('@/server/matchCardH2h', () => ({ loadMatchCardH2h: async () => null }));
vi.mock('@/server/matchDetailSeed', () => ({ loadMatchDetailSeed: async () => ({ stats: null, lineups: null }) }));
vi.mock('@/server/analysisPreviewForPage', () => ({ loadAnalysisPreviewForPage: async () => null }));

const ctx = (slug: string, resolvedUrl: string) =>
  ({ params: { slug }, resolvedUrl, res: { setHeader: () => {}, statusCode: 200 } }) as unknown as GetServerSidePropsContext;

describe('maç sayfası kanonik slug 301', () => {
  it("eski slug → yeni slug, sorgu korunur; slug'sız → kanonik; kanonik → sayfa", async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    expect(await getServerSideProps(ctx('19621877-s-o-paulo-santos', '/matches/19621877-s-o-paulo-santos?tab=ai'))).toEqual({
      redirect: { destination: '/matches/19621877-sao-paulo-santos?tab=ai', statusCode: 301 },
    });
    expect(await getServerSideProps(ctx('19621877', '/matches/19621877'))).toEqual({
      redirect: { destination: '/matches/19621877-sao-paulo-santos', statusCode: 301 },
    });
    const ok = await getServerSideProps(ctx('19621877-sao-paulo-santos', '/matches/19621877-sao-paulo-santos'));
    const props = 'props' in ok ? await ok.props : null;
    expect(props?.initialMatch?.id).toBe(19621877);
  });
});
