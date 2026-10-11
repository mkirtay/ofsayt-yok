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
    loadFinished: vi.fn(async () => []),
    loadEvents: vi.fn(async () => []),
    isEvaluated: vi.fn(async () => false),
    markEvaluated: vi.fn(async () => {}),
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

const finished = (id: number, league_id: number, homeId: number, awayId: number, h: number, a: number, over: Partial<PreviewFixture> = {}): PreviewFixture => ({
  id,
  league_id,
  state_id: 5,
  starting_at_timestamp: ko(-240),
  participants: [
    { id: homeId, name: `H${id}`, country_id: 404, meta: { location: 'home' } },
    { id: awayId, name: `A${id}`, country_id: 404, meta: { location: 'away' } },
  ],
  scores: [
    { description: 'CURRENT', score: { goals: h, participant: 'home' } },
    { description: 'CURRENT', score: { goals: a, participant: 'away' } },
    { description: '1ST_HALF', score: { goals: 9, participant: 'home' } },
  ],
  ...over,
});

describe('runMatchPostsTick — RECAP', () => {
  it('biten + kapsamdaki + koşulu olan maça PENDING RECAP yazar (derbi, 3+ fark, 5+ gol, büyük takım yenilgisi, penaltı)', async () => {
    const { deps, created } = makeDeps([], {
      isDerby: vi.fn(async (h: number) => h === 88), // yalnız id 88 derbi
      loadFinished: vi.fn(async () => [
        finished(1, 600, 88, 5, 1, 1), // derbi
        finished(2, 600, 34, 5, 4, 0), // 4 farklı galibiyet
        finished(3, 600, 1, 554, 2, 3), // 5 gol (büyük takım kazandı → sürpriz değil)
        finished(4, 600, 5, 688, 2, 0), // büyük takım kaybetti
        finished(5, 2, 50, 51, 1, 1, { state_id: 8 }), // penaltılarla bitti
      ]),
    });
    const { recap } = await runMatchPostsTick(deps);
    expect(created.map((c) => c.externalKey)).toEqual(['recap:1', 'recap:2', 'recap:3', 'recap:4', 'recap:5']);
    expect(created.every((c) => c.kind === 'RECAP')).toBe(true);
    expect(created[0].body).toContain('Maç sonu: H1 1-1 A1');
    expect(created[0].body).toContain('Derbi berabere bitti.');
    expect(created[1].body).toContain('H2 4 gol farkla kazandı.');
    expect(created[3].body).toContain('A4 bu maçı kaybetti.'); // deplasmandaki Trabzonspor (688) kaybetti
    expect(recap).toMatchObject({ created: 5, errors: 0 });
  });

  it('koşul yoksa post yok; olaylar yalnız koşul yoksa çekilir; "değerlendirildi" işareti konur ve sonraki tick atlar', async () => {
    const loadEvents = vi.fn(async () => []);
    const markEvaluated = vi.fn(async () => {});
    const { deps, created } = makeDeps([], {
      isDerby: vi.fn(async () => false),
      loadEvents,
      markEvaluated,
      loadFinished: vi.fn(async () => [finished(1, 600, 34, 5, 1, 0), finished(2, 600, 34, 5, 4, 0)]),
    });
    const { recap } = await runMatchPostsTick(deps);
    expect(created.map((c) => c.externalKey)).toEqual(['recap:2']);
    expect(loadEvents).toHaveBeenCalledTimes(1); // yalnız koşulsuz maç (1) için
    expect(loadEvents).toHaveBeenCalledWith(1);
    expect(markEvaluated).toHaveBeenCalledWith(1);
    expect(recap).toMatchObject({ noReason: 1, created: 1 });

    const again = makeDeps([], {
      isEvaluated: vi.fn(async () => true),
      loadFinished: vi.fn(async () => [finished(1, 600, 34, 5, 1, 0)]),
    });
    expect((await runMatchPostsTick(again.deps)).recap).toMatchObject({ evaluated: 1, created: 0 });
    expect(again.deps.loadEvents).not.toHaveBeenCalled();
  });

  it('kırmızı kart (olaylardan) tek başına koşuldur', async () => {
    const { deps, created } = makeDeps([], {
      isDerby: vi.fn(async () => false),
      loadEvents: vi.fn(async () => [{ type_id: 20 }, { type_id: 19 }, { type_id: 21 }]),
      loadFinished: vi.fn(async () => [finished(1, 600, 34, 5, 1, 0)]),
    });
    await runMatchPostsTick(deps);
    expect(created[0].body).toContain('Maçta 2 kırmızı kart çıktı.');
  });

  it('bitmemiş / çok eski / kapsam dışı maçlar işlenmez; rakip listesi okunamazsa karar verilmez (işaret yok)', async () => {
    const { deps, created } = makeDeps([], {
      loadFinished: vi.fn(async () => [
        finished(1, 600, 34, 5, 4, 0, { state_id: 2 }),
        finished(2, 600, 34, 5, 4, 0, { starting_at_timestamp: ko(-60 * 24) }),
        finished(3, 600, 1, 2, 4, 0),
      ]),
    });
    expect((await runMatchPostsTick(deps)).recap.candidates).toBe(0);
    expect(created).toHaveLength(0);

    const unknown = makeDeps([], { isDerby: vi.fn(async () => null), loadFinished: vi.fn(async () => [finished(1, 600, 34, 5, 1, 0)]) });
    expect((await runMatchPostsTick(unknown.deps)).recap).toMatchObject({ skipped: 1, created: 0 });
    expect(unknown.deps.markEvaluated).not.toHaveBeenCalled();
  });

  it('maç başına tek RECAP: mevcut anahtar atlanır; yükleme hatası PREVIEW geçişini etkilemez', async () => {
    const a = makeDeps([], { existingKeys: vi.fn(async () => new Set(['recap:1'])), loadFinished: vi.fn(async () => [finished(1, 600, 34, 5, 4, 0)]) });
    expect((await runMatchPostsTick(a.deps)).recap).toMatchObject({ existing: 1, created: 0 });

    const b = makeDeps([fixture(1, 600, 34, 5)], { loadFinished: vi.fn(async () => { throw new Error('429'); }) });
    const r = await runMatchPostsTick(b.deps);
    expect(r.recap.errors).toBe(1);
    expect(r.preview.created).toBe(1);
  });
});
