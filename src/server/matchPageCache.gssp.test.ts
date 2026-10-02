import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import type { Match } from '@/models/liveScore';

// `/matches/[slug]` gSSP: form / karşılaşma geçmişi bütçeye yetişmezse yanıt kısa cache'lenir.

const h2hResult = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('@/services/sportmonksProviderFlag', () => ({
  isSportmonksProviderEnabled: () => true,
  toStandingsCompetitionId: (id: unknown) => id,
}));
vi.mock('@/server/resolveMatchPage', () => ({
  resolveMatchPage: async () => ({
    kind: 'match',
    match: { id: 19745050, status: 'FINISHED', date: '2026-09-20', scheduled: '18:00' } as unknown as Match,
  }),
}));
vi.mock('@/server/matchCardH2h', () => ({ loadMatchCardH2h: async () => h2hResult.value }));

function context() {
  const headers: Record<string, string> = {};
  const ctx = {
    params: { slug: '19745050-eldense-real-oviedo' },
    res: { setHeader: (k: string, v: string) => void (headers[k] = v), statusCode: 200 },
  } as unknown as GetServerSidePropsContext;
  return { ctx, headers };
}

describe('maç sayfası Cache-Control — form / karşılaşma geçmişi', () => {
  beforeEach(() => {
    h2hResult.value = undefined;
  });

  it('bütçe aşıldı (initialH2h yok, iskelet) → s-maxage=30, stale-while-revalidate=30', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    const { ctx, headers } = context();
    const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
    expect('initialH2h' in result.props).toBe(false);
    expect(headers['Cache-Control']).toBe('public, s-maxage=30, stale-while-revalidate=30');
  });

  it('veri geldi (ya da "veri yok" = null) → maçın kendi süresi (bitmiş maç: 1 gün)', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    for (const value of [{ team1: {}, team2: {}, h2h: [] }, null]) {
      h2hResult.value = value;
      const { ctx, headers } = context();
      const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
      expect(result.props.initialH2h).toEqual(value);
      expect(headers['Cache-Control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');
    }
  });
});
