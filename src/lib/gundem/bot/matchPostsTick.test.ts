import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn(), sportmonksClientRequest: vi.fn() }));

import { captureError } from '@/lib/logger';
import { runMatchPostsTick, type MatchPostsDeps } from './matchPostsTick';
import type { PreviewFixture } from './previewPost';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const ko = (min: number) => (NOW + min * 60_000) / 1000;
const fixture = (id: number, league_id: number, homeId: number, awayId: number, over: Partial<PreviewFixture> = {}): PreviewFixture => ({
  id,
  league_id,
  state_id: 1,
  starting_at_timestamp: ko(90),
  participants: [
    { id: homeId, name: `H${id}`, country_id: 404, meta: { location: 'home' } },
    { id: awayId, name: `A${id}`, country_id: 404, meta: { location: 'away' } },
  ],
  ...over,
});
const analysisRow = (matchId: string) => ({
  id: `an-${matchId}`,
  homeTeamName: 'H',
  awayTeamName: 'A',
  modelVersion: 'v4',
  matchPrediction: { home: 50, draw: 25, away: 25 },
  fullReport: { matchSummary: { tempo: 'Tempo cümlesi.', dominantSide: 'Baskın taraf cümlesi.' } },
});

function makeDeps(fixtures: PreviewFixture[], over: Partial<MatchPostsDeps> = {}) {
  const created: { externalKey: string; kind: string; body: string }[] = [];
  const deps: MatchPostsDeps = {
    now: () => NOW,
    loadFixtures: vi.fn(async () => fixtures),
    existingKeys: vi.fn(async () => new Set<string>()),
    findAnalysis: vi.fn(async (id: string) => analysisRow(id) as never),
    isDerby: vi.fn(async () => true),
    createDraft: vi.fn(async (d) => { created.push(d); }),
    ...over,
  };
  return { deps, created };
}

beforeEach(() => vi.mocked(captureError).mockClear());

describe('runMatchPostsTick — PREVIEW', () => {
  it('kapsamdaki maçlar için analizden PENDING taslak yazar; kapsam dışını yazmaz', async () => {
    const { deps, created } = makeDeps([
      fixture(1, 600, 34, 5), // Süper Lig + Galatasaray
      fixture(2, 600, 1, 2), // Süper Lig, büyük 4 yok
      fixture(3, 2, 50, 51), // UCL, ikisi de Türk (404)
      fixture(4, 8, 7, 8), // PL, derbi
    ]);
    const { preview } = await runMatchPostsTick(deps);
    expect(created.map((c) => c.externalKey)).toEqual(['preview:1', 'preview:3', 'preview:4']);
    expect(created.every((c) => c.kind === 'PREVIEW')).toBe(true);
    expect(preview).toMatchObject({ candidates: 3, created: 3, errors: 0 });
  });

  it('PRE analizi yoksa post çıkmaz, analiz ÜRETİLMEZ ve derbi sorgusu (Sportmonks) yapılmaz', async () => {
    const { deps, created } = makeDeps([fixture(1, 600, 34, 5), fixture(4, 8, 7, 8)], { findAnalysis: vi.fn(async () => null) });
    const { preview } = await runMatchPostsTick(deps);
    expect(created).toHaveLength(0);
    expect(preview).toMatchObject({ candidates: 2, noAnalysis: 2, created: 0 });
    expect(deps.isDerby).not.toHaveBeenCalled();
  });

  it('5 büyük ligde derbi değilse (ya da rakip listesi okunamadıysa) taslak yok', async () => {
    for (const verdict of [false, null]) {
      const { deps, created } = makeDeps([fixture(4, 564, 7, 8)], { isDerby: vi.fn(async () => verdict) });
      const { preview } = await runMatchPostsTick(deps);
      expect(created).toHaveLength(0);
      expect(preview.notDerby).toBe(1);
    }
  });

  it('maç başına tek taslak: mevcut anahtar ya da eşzamanlı tick (P2002) tekrar üretmez', async () => {
    const a = makeDeps([fixture(1, 600, 34, 5)], { existingKeys: vi.fn(async () => new Set(['preview:1'])) });
    expect((await runMatchPostsTick(a.deps)).preview).toMatchObject({ existing: 1, created: 0 });
    expect(a.deps.findAnalysis).not.toHaveBeenCalled();

    const b = makeDeps([fixture(1, 600, 34, 5)], { createDraft: vi.fn(async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); }) });
    expect((await runMatchPostsTick(b.deps)).preview).toMatchObject({ existing: 1, created: 0, errors: 0 });
  });

  it('fikstür yükleme / mevcut okuma / tek maç hatası tick\'i düşürmez; Sentry\'ye gider', async () => {
    const load = makeDeps([], { loadFixtures: vi.fn(async () => { throw new Error('429'); }) });
    expect((await runMatchPostsTick(load.deps)).preview.errors).toBe(1);

    const exist = makeDeps([fixture(1, 600, 34, 5)], { existingKeys: vi.fn(async () => { throw new Error('db'); }) });
    expect((await runMatchPostsTick(exist.deps)).preview.errors).toBe(1);

    const { deps, created } = makeDeps([fixture(1, 600, 34, 5), fixture(2, 600, 88, 5)], {
      findAnalysis: vi.fn(async (id: string) => { if (id === '1') throw new Error('db'); return analysisRow(id) as never; }),
    });
    const { preview } = await runMatchPostsTick(deps);
    expect(preview).toMatchObject({ errors: 1, created: 1 });
    expect(created.map((c) => c.externalKey)).toEqual(['preview:2']);
    expect(captureError).toHaveBeenCalled();
  });

  it('pencere dışı maçlar (bir saatten az / iki saatten çok) işlenmez', async () => {
    const { deps, created } = makeDeps([
      fixture(1, 600, 34, 5, { starting_at_timestamp: ko(30) }),
      fixture(2, 600, 34, 5, { starting_at_timestamp: ko(200) }),
    ]);
    expect((await runMatchPostsTick(deps)).preview.candidates).toBe(0);
    expect(created).toHaveLength(0);
  });
});
