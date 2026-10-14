import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import type { Match } from '@/models/liveScore';

// `/matches/[slug]` gSSP: form / karşılaşma geçmişi bütçeye yetişmezse yanıt kısa cache'lenir.

const h2hResult = vi.hoisted(() => ({ value: undefined as unknown }));
const seedResult = vi.hoisted(() => ({ value: { stats: null, lineups: null } as { stats: unknown; lineups: unknown } }));

vi.mock('@/services/sportmonksProviderFlag', () => ({
  isSportmonksProviderEnabled: () => true,
  toStandingsCompetitionId: (id: unknown) => id,
}));
const resolveKind = vi.hoisted(() => ({ value: 'match' as 'match' | 'error' | 'throw' }));
vi.mock('@/server/resolveMatchPage', () => ({
  resolveMatchPage: async () => {
    if (resolveKind.value === 'throw') throw new Error('Sportmonks 429');
    if (resolveKind.value === 'error') return { kind: 'error' };
    return {
      kind: 'match',
      match: { id: 19745050, status: 'FINISHED', date: '2026-09-20', scheduled: '18:00' } as unknown as Match,
      events: [{ id: 1, minute: 4, type: 'goal' }],
    };
  },
}));
vi.mock('@/server/matchCardH2h', () => ({ loadMatchCardH2h: async () => h2hResult.value }));
vi.mock('@/server/matchDetailSeed', () => ({ loadMatchDetailSeed: async () => seedResult.value }));
const pressure = vi.hoisted(() => ({ value: false, calls: { h2h: 0, seed: 0 } }));
vi.mock('@/server/sportmonks/poolGuard', () => ({ isPoolUnderPressure: async () => pressure.value, poolForPath: () => 'Fixture' }));

function context(reqHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {};
  const ctx = {
    params: { slug: '19745050-eldense-real-oviedo' },
    req: { headers: reqHeaders },
    res: { setHeader: (k: string, v: string) => void (headers[k] = v), statusCode: 200 },
  } as unknown as GetServerSidePropsContext;
  return { ctx, headers };
}

describe('maç sayfası Cache-Control — form / karşılaşma geçmişi', () => {
  beforeEach(() => {
    h2hResult.value = undefined;
    seedResult.value = { stats: null, lineups: null };
    pressure.value = false;
    resolveKind.value = 'match';
  });

  it('Fixture havuzu baskı altında → H2H / istatistik / kadro SSR\'da atlanır (istemci çeker), maç ve olaylar yine sunucuda, kısa CDN', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    pressure.value = true;
    h2hResult.value = { team1: {}, team2: {}, h2h: [] };
    seedResult.value = { stats: { home: {}, away: {} }, lineups: null };
    const { ctx, headers } = context();
    const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
    expect(result.props.initialMatch).toMatchObject({ id: 19745050 });
    expect(result.props.initialEvents).toEqual([{ id: 1, minute: 4, type: 'goal' }]);
    for (const k of ['initialH2h', 'initialStats', 'initialLineups']) expect(k in result.props).toBe(false);
    expect(headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=3600');
  });

  it('bütçe aşıldı (initialH2h yok, iskelet) → bitmiş maçta s-maxage=3600, stale-while-revalidate=3600', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    const { ctx, headers } = context();
    const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
    expect('initialH2h' in result.props).toBe(false);
    expect(headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=3600');
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

  it('Genel Bakış verisi SSR\'da: olaylar maçı çözen istekten, istatistik gelince props\'ta; kadro yalnız "yok" ise', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    h2hResult.value = null;
    seedResult.value = { stats: { home: {}, away: {} }, lineups: null };
    const { ctx, headers } = context();
    const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
    expect(result.props.initialEvents).toEqual([{ id: 1, minute: 4, type: 'goal' }]);
    expect(result.props.initialStats).toEqual({ home: {}, away: {} });
    expect(result.props.initialLineups).toBeNull();
    expect(headers['Cache-Control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');

    // Kadro varsa props'a girmez (istemci çeker; HTML büyümesin) ama yanıt tam sayılır.
    seedResult.value = { stats: null, lineups: { lineup: {} } };
    const second = context();
    const r2 = (await getServerSideProps(second.ctx)) as { props: Record<string, unknown> };
    expect('initialLineups' in r2.props).toBe(false);
    expect(second.headers['Cache-Control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');
  });

  it('istatistik ya da kadro bütçeyi aştı → alan yok (istemci çeker), yanıt kısa cache\'lenir', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    h2hResult.value = null;
    for (const value of [{ stats: undefined, lineups: null }, { stats: null, lineups: undefined }]) {
      seedResult.value = value;
      const { ctx, headers } = context();
      const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
      expect('initialStats' in result.props).toBe(value.stats !== undefined);
      expect('initialLineups' in result.props).toBe(value.lineups === null);
      expect(headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=3600');
    }
  });

  it('AI / kazıyıcı bot → hafif sürüm: maç + olaylar var, H2H / istatistik / kadro sunucuda çekilmez, CDN\'de saklanmaz', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    h2hResult.value = { team1: {}, team2: {}, h2h: [] };
    seedResult.value = { stats: { home: {}, away: {} }, lineups: null };
    const { ctx, headers } = context({ 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)' });
    const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
    expect(result.props.initialMatch).toMatchObject({ id: 19745050 });
    expect(result.props.initialEvents).toEqual([{ id: 1, minute: 4, type: 'goal' }]);
    for (const k of ['initialH2h', 'initialStats', 'initialLineups']) expect(k in result.props).toBe(false);
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('Googlebot ve gerçek tarayıcı → tam sayfa (bot kuralı uygulanmaz)', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    h2hResult.value = { team1: {}, team2: {}, h2h: [] };
    seedResult.value = { stats: { home: {}, away: {} }, lineups: null };
    for (const ua of [
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ]) {
      const { ctx, headers } = context({ 'user-agent': ua });
      const result = (await getServerSideProps(ctx)) as { props: Record<string, unknown> };
      expect(result.props.initialH2h).toEqual({ team1: {}, team2: {}, h2h: [] });
      expect(result.props.initialStats).toEqual({ home: {}, away: {} });
      expect(headers['Cache-Control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');
    }
  });

  it('geçici sağlayıcı hatası (429, önbellekte veri yok) → HTML 503 + Retry-After, saklanmaz; istemci gezinmesi (veri isteği) 200', async () => {
    const { getServerSideProps } = await import('@/pages/matches/[slug]');
    for (const kind of ['error', 'throw'] as const) {
      resolveKind.value = kind;
      const html = context();
      const r = (await getServerSideProps(html.ctx)) as { props: Record<string, unknown> };
      expect(r.props.initialMatch).toBeNull();
      expect(html.ctx.res.statusCode).toBe(503);
      expect(html.headers['Retry-After']).toBe('120');
      expect(html.headers['Cache-Control']).toBe('no-store');

      const data = context({ 'x-nextjs-data': '1' });
      await getServerSideProps(data.ctx);
      expect(data.ctx.res.statusCode).toBe(200);
      expect(data.headers['Cache-Control']).toBeUndefined();
    }
  });
});
