import { describe, expect, it } from 'vitest';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { buildPreviewDraft, previewReason, selectPreviewCandidates, type PreviewFixture } from './previewPost';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const MIN = 60_000;
const fx = (over: Partial<PreviewFixture> & { home?: [number, number?]; away?: [number, number?]; inMin?: number }): PreviewFixture => ({
  id: over.id ?? 1,
  league_id: over.league_id ?? 600,
  state_id: over.state_id ?? 1,
  starting_at_timestamp: (NOW + (over.inMin ?? 90) * MIN) / 1000,
  participants: [
    { id: over.home?.[0] ?? 34, name: 'Galatasaray', country_id: over.home?.[1] ?? 404, meta: { location: 'home' } },
    { id: over.away?.[0] ?? 9999, name: 'Rakip', country_id: over.away?.[1] ?? 404, meta: { location: 'away' } },
  ],
});

describe('büyük maç tanımı (previewReason)', () => {
  it('Süper Lig: dört büyükten biri varsa (ev ya da deplasman), yoksa kapsam dışı', () => {
    expect(previewReason(fx({ home: [34] }))).toBe('super-lig-big4');
    expect(previewReason(fx({ home: [1], away: [88] }))).toBe('super-lig-big4');
    expect(previewReason(fx({ home: [1], away: [2] }))).toBeNull();
    for (const id of [34, 88, 554, 688]) expect(previewReason(fx({ home: [id] }))).toBe('super-lig-big4');
  });

  it('Avrupa kupaları (2/5/2286): Türk takımı varsa; yoksa kapsam dışı', () => {
    for (const league_id of [2, 5, 2286]) {
      expect(previewReason(fx({ league_id, home: [1, 404], away: [2, 1] }))).toBe('uefa-turkish');
      expect(previewReason(fx({ league_id, home: [1, 1], away: [2, 1] }))).toBeNull();
    }
  });

  it('5 büyük lig: derbi adayı (derbi olduğu ayrıca doğrulanır); diğer ligler kapsam dışı', () => {
    for (const league_id of [8, 82, 301, 384, 564]) expect(previewReason(fx({ league_id }))).toBe('big5-derby');
    expect(previewReason(fx({ league_id: 606 }))).toBeNull();
  });
});

describe('selectPreviewCandidates', () => {
  it('yalnızca başlamasına 1–2 saat kalan, başlamamış maçlar; saate göre sıralı', () => {
    const list = [
      fx({ id: 1, inMin: 59 }),
      fx({ id: 2, inMin: 60 }),
      fx({ id: 3, inMin: 120 }),
      fx({ id: 4, inMin: 121 }),
      fx({ id: 5, inMin: 90, state_id: 3 }),
      fx({ id: 6, inMin: 70 }),
    ];
    expect(selectPreviewCandidates(list, NOW).map((c) => c.fixture.id)).toEqual([2, 6, 3]);
  });
});

const analysis = {
  id: 'a1',
  homeTeamName: 'Galatasaray',
  awayTeamName: 'Rakip',
  modelVersion: 'v4',
  matchPrediction: { home: 58, draw: 24, away: 18 },
  fullReport: {
    matchSummary: { tempo: 'Yüksek tempolu bir maç bekleniyor. İkinci cümle.', dominantSide: 'Ev sahibi topa daha çok sahip olacak.' },
    tacticalAnalysis: 'GİZLİ TAKTİK',
    analystComment: 'GİZLİ YORUM',
  },
  scorePrediction: { home: 2, away: 1 },
  bettingTips: [{ x: 'GİZLİ SENARYO' }],
  homeTeamNarrative: 'GİZLİ NARRATİF',
};

describe('buildPreviewDraft', () => {
  const cand = () => selectPreviewCandidates([fx({ id: 42, inMin: 90 })], NOW)[0];

  it('anahtar, saat (TSİ), özet ve olasılık; kilitli alanlar sızmaz', () => {
    const d = buildPreviewDraft(cand(), analysis)!;
    expect(d.externalKey).toBe('preview:42');
    expect(d.body).toContain('Galatasaray – Rakip (Süper Lig), saat 16:30.');
    expect(d.body).toContain('Yüksek tempolu bir maç bekleniyor.');
    expect(d.body).toContain('Ev sahibi topa daha çok sahip olacak.');
    expect(d.body).toContain('Analiz görüşü: Galatasaray kazanır %58');
    expect(d.body).not.toMatch(/GİZLİ|İkinci cümle|2-1|2 – 1/);
    expect(d.facts).toMatchObject({ kind: 'PREVIEW', fixtureId: 42, reason: 'super-lig-big4', analysisId: 'a1', kickoffAt: '2026-10-11T13:30:00.000Z' });
  });

  it("deplasman ve beraberlik olasılığı doğru adlandırılır", () => {
    const away = buildPreviewDraft(cand(), { ...analysis, matchPrediction: { home: 20, draw: 25, away: 55 } })!;
    expect(away.body).toContain('Analiz görüşü: Rakip kazanır %55');
    const draw = buildPreviewDraft(cand(), { ...analysis, matchPrediction: { home: 30, draw: 40, away: 30 } })!;
    expect(draw.body).toContain('Analiz görüşü: Beraberlik %40');
  });

  it('metin POST_MAX_LENGTH içinde kalır (uzun özetlerde parça parça kısaltılır)', () => {
    const long = 'Çok uzun bir cümle '.repeat(12).trim() + '.';
    const d = buildPreviewDraft(cand(), { ...analysis, fullReport: { matchSummary: { tempo: long, dominantSide: long } } })!;
    expect(d.body.length).toBeLessThanOrEqual(POST_MAX_LENGTH);
  });

  it('önizleme üretilemiyorsa (özet de olasılık da yok) null', () => {
    expect(buildPreviewDraft(cand(), { ...analysis, matchPrediction: {}, fullReport: {} })).toBeNull();
  });
});
