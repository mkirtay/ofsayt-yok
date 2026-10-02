import { describe, expect, it } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import { WORLD_CUP_PAGE_ENABLED } from '@/config/worldCup';

// /world-cup kapalı: ana sayfaya 302 (sayfa kodu duruyor).
describe('/world-cup yönlendirmesi', () => {
  it('sayfa kapalıyken ana sayfaya 302', async () => {
    expect(WORLD_CUP_PAGE_ENABLED).toBe(false);
    const { getServerSideProps } = await import('@/pages/world-cup/index');
    const headers: Record<string, string> = {};
    const ctx = { res: { setHeader: (k: string, v: string) => void (headers[k] = v) } } as unknown as GetServerSidePropsContext;
    expect(await getServerSideProps(ctx)).toEqual({ redirect: { destination: '/', statusCode: 302 } });
    expect(headers['Cache-Control']).toContain('s-maxage=3600');
  });
});
