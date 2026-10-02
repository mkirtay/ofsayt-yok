import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';

/** /teams/[id] ISR kabuğu: tek önbellekli istek (takım adı), takım yoksa 404, geçici hatada etiketsiz kısa kabuk. */
const h = vi.hoisted(() => ({ overview: vi.fn() }));
vi.mock('@/services/teamPage', () => ({ getTeamOverview: h.overview }));

import { getStaticPaths, getStaticProps } from '@/pages/teams/[id]';

beforeEach(() => h.overview.mockReset());

const props = (id: string) => getStaticProps({ params: { id } } as never);

describe('/teams/[id] getStaticPaths / getStaticProps', () => {
  it('önceden sayfa üretilmez, fallback blocking', async () => {
    expect(await getStaticPaths({} as never)).toEqual({ paths: [], fallback: 'blocking' });
  });

  it('bulundu: ad + görsel adresi, 7 gün; tek istek', async () => {
    h.overview.mockResolvedValue({ team: { id: 34, name: 'Galatasaray' }, recent: [], fixtures: [], campaigns: [] });
    const r = (await props('34')) as { props: { teamName: string; ogImagePath: string }; revalidate: number };
    expect(r.props.teamName).toBe('Galatasaray');
    expect(r.props.ogImagePath).toMatch(/^\/api\/og\/team\/34\?v=\d{8}$/);
    expect(r.revalidate).toBe(7 * 86_400);
    expect(h.overview).toHaveBeenCalledTimes(1);
    expect(h.overview).toHaveBeenCalledWith('34');
  });

  it('takım yok (Sportmonks 404 / boş) ya da geçersiz kimlik → 404', async () => {
    h.overview.mockRejectedValueOnce(new SportmonksHttpError('yok', 404, {}));
    expect(await props('999')).toEqual({ notFound: true, revalidate: 86_400 });
    h.overview.mockResolvedValueOnce({ team: null, recent: [], fixtures: [], campaigns: [] });
    expect(await props('998')).toEqual({ notFound: true, revalidate: 86_400 });
    expect(await props('abc')).toEqual({ notFound: true, revalidate: 86_400 });
  });

  it('geçici hata → sayfa yine açılır (ad yok), 60 sn sonra yeniden', async () => {
    h.overview.mockRejectedValueOnce(new SportmonksHttpError('down', 503, {}));
    const r = (await props('34')) as { props: { teamName: string | null }; revalidate: number };
    expect(r.props.teamName).toBeNull();
    expect(r.revalidate).toBe(60);
  });
});
