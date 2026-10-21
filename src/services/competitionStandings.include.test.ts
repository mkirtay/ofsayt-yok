import { beforeEach, describe, expect, it, vi } from 'vitest';

const collect = vi.fn(async (_o: unknown) => [] as unknown[]);
vi.mock('./sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async () => ({ data: { id: 600, seasons: [{ id: 28203, is_current: true }] } })),
  sportmonksCollectAllPages: (o: unknown) => collect(o),
}));

const { fetchCompetitionStandings, STANDINGS_WITH_FORM_INCLUDE, STANDINGS_WITH_GROUPS_INCLUDE } = await import('./competitionStandings');

const includeOf = () => (collect.mock.calls.at(-1)?.[0] as unknown as { extraParams: { include: string } }).extraParams.include;

describe('fetchCompetitionStandings include', () => {
  beforeEach(() => collect.mockClear());

  it('varsayılan lig formu dahil (yan panel / maç / takım sayfası / Puan Durumu aynı önbellek anahtarı)', async () => {
    await fetchCompetitionStandings('600');
    expect(includeOf()).toBe(STANDINGS_WITH_FORM_INCLUDE);
    expect(STANDINGS_WITH_FORM_INCLUDE).toBe('participant;details.type;group;stage;form');
    await fetchCompetitionStandings('600', { season: 28203, withForm: true });
    expect(includeOf()).toBe(STANDINGS_WITH_FORM_INCLUDE);
  });

  it('withForm: false eski hafif include', async () => {
    await fetchCompetitionStandings('600', { season: 28203, withForm: false });
    expect(includeOf()).toBe(STANDINGS_WITH_GROUPS_INCLUDE);
  });
});
