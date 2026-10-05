import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  stored: null as Record<string, unknown> | null,
  unlock: null as { id: string } | null,
  finished: false,
  overview: new Map<string, { recent: unknown[]; fixtures: unknown[] }>(),
  search: new Map<string, Array<{ id: number; name: string }>>(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { predictionRecord: { findUnique: vi.fn(async () => null) } } }));
vi.mock('@/lib/matchAnalysisLookup', () => ({ findStoredMatchAnalysis: vi.fn(async () => h.stored) }));
vi.mock('@/lib/analysisUnlock', () => ({ ANALYSIS_UNLOCK_COST: 1, findUnlock: vi.fn(async () => h.unlock) }));
vi.mock('@/server/analysisAccess', () => ({ isAnalysisMatchFinished: vi.fn(async () => h.finished) }));
vi.mock('@/server/analysisPregen', () => ({ isInPregenScope: vi.fn(async (m: { leagueId?: number }) => m.leagueId === 600) }));
vi.mock('@/services/teamPage', () => ({ getTeamOverview: vi.fn(async (id: string) => h.overview.get(id) ?? { recent: [], fixtures: [] }) }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_b: string, path: string) => ({ data: h.search.get(decodeURIComponent(path.split('/').pop()!)) ?? [] })),
}));

import {
  analysisCardForMatch,
  answerMatchAnalysisRequest,
  noAnalysisReason,
  parseMatchAnalysisIntent,
  pickFixtures,
  resolveTeamFromAliases,
} from './matchAnalysisRequest';
import { findGamblingTerms } from '@/utils/gamblingTerms';

/** Kilitli alanlarda ayırt edici metin: yanıtta bulunmamalı. */
const LOCKED_MARKERS = ['GIZLI_ANALIST', 'GIZLI_SENARYO', 'GIZLI_TAKIM', 'GIZLI_TAKTIK', 'GIZLI_GEREKCE', '3-1'];
const analysisRow = () => ({
  id: 'a1',
  matchId: '19746594',
  modelVersion: 'v5-2026-10-openai:gpt-6-luna',
  homeTeamName: 'Galatasaray',
  awayTeamName: 'Kasımpaşa',
  matchPrediction: { home: 55, draw: 25, away: 20, reasoning: 'İç saha formu ev sahibini öne çıkarıyor. GIZLI_GEREKCE ikinci cümle.' },
  scorePrediction: { mostLikely: '3-1' },
  bettingTips: [{ metric: '2+ gol', probability: 78, confidence: 'medium', reasoning: 'GIZLI_SENARYO' }],
  teamAnalyses: { home: { narrative: 'GIZLI_TAKIM' }, away: { narrative: 'GIZLI_TAKIM' } },
  fullReport: {
    matchSummary: { tempo: 'Galatasaray baskıyla başlar.', dominantSide: 'Galatasaray daha baskın görünüyor.' },
    tacticalAnalysis: { keyBattleZones: 'GIZLI_TAKTIK' },
    analystComment: 'Hücum kalitesi belirleyici olacak. Kasımpaşa kupon için iyi bir seçim. GIZLI_ANALIST son.',
  },
});

const match = { id: 19746594, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: 1, status: 'NOT STARTED' };
const viewer = (over: Record<string, unknown> = {}) =>
  ({ id: 'u1', role: 'USER', credits: 3, premiumUntil: null, emailVerified: null, createdAt: new Date(), ...over }) as never;

describe('asistan — niyet ve takım', () => {
  it('maç analizi isteğini ayrıştırır', () => {
    expect(parseMatchAnalysisIntent('GS–Kasımpaşa maçını analiz et')).toEqual({ home: 'GS', away: 'Kasımpaşa' });
    expect(parseMatchAnalysisIntent('Galatasaray - Fenerbahçe analizi')).toEqual({ home: 'Galatasaray', away: 'Fenerbahçe' });
    expect(parseMatchAnalysisIntent('Arsenal vs Leeds maçını analiz eder misin?')).toEqual({ home: 'Arsenal', away: 'Leeds' });
    expect(parseMatchAnalysisIntent('Cimbom ile Kasımpaşa maçı analizi')).toEqual({ home: 'Cimbom', away: 'Kasımpaşa' });
  });

  it('analiz isteği değilse ya da tek takımsa null', () => {
    expect(parseMatchAnalysisIntent('GS–Kasımpaşa kaç kaç bitti')).toBeNull();
    expect(parseMatchAnalysisIntent('Galatasaray maçını analiz et')).toBeNull();
    expect(parseMatchAnalysisIntent('')).toBeNull();
  });

  it('takma ad sözlüğü (aksansız, büyük/küçük harf duyarsız)', () => {
    expect(resolveTeamFromAliases('GS').map((t) => t.id)).toEqual([34]);
    expect(resolveTeamFromAliases('cimbom').map((t) => t.id)).toEqual([34]);
    expect(resolveTeamFromAliases('kasimpasa').map((t) => t.id)).toEqual([1071]);
    expect(resolveTeamFromAliases('Hiç Yok FK')).toEqual([]);
  });

  it('fikstürde önce oynanmamış, sonra oynanmış karşılaşma', () => {
    const m = (id: number, home: number, away: number, status: string) => ({ id, home: { id: home, name: `T${home}` }, away: { id: away, name: `T${away}` }, status, kickoff_ts: id });
    const list = pickFixtures({ fixtures: [m(3, 34, 9, 'NOT STARTED'), m(2, 34, 1071, 'NOT STARTED')], recent: [m(1, 1071, 34, 'FINISHED')] } as never, new Set([1071]));
    expect(list.map((c) => c.id)).toEqual([2, 1]);
  });
});

describe('asistan — kredi duvarı', () => {
  beforeEach(() => {
    h.stored = analysisRow();
    h.unlock = null;
    h.finished = false;
  });

  it('analiz yok: kapsamda + 3 saatten çok → "scheduled"; başlamamış ama kapsam dışı / 3 saatten az → "self-serve"; başlamış → "not-planned"; üretim yok', async () => {
    h.stored = null;
    const HOUR = 3600_000;
    const now = Date.now();
    const m = (over: Record<string, unknown>) => ({ ...match, leagueId: 600, homeId: 34, awayId: 1071, kickoffMs: now + 5 * HOUR, ...over });
    expect(await analysisCardForMatch(viewer(), m({}))).toEqual({
      kind: 'none',
      reason: 'scheduled',
      signedIn: true,
      cost: 1,
      match: { id: 19746594, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: now + 5 * HOUR, href: '/matches/19746594-galatasaray-kasimpasa?sekme=ai-analiz' },
    });
    // Arjantin ligi (ör. Banfield–Rosario Central): ön üretim kapsamında değil → kullanıcı kendi üretebilir (yönlendirme).
    expect(await analysisCardForMatch(viewer(), m({ leagueId: 636 }))).toMatchObject({ kind: 'none', reason: 'self-serve', signedIn: true });
    expect(await analysisCardForMatch(null, m({ leagueId: 636 }))).toMatchObject({ reason: 'self-serve', signedIn: false });
    // Kapsamda ama 3 saatten az kalmış: ön üretim gelmeyecek → yine yönlendirme.
    expect(await noAnalysisReason(m({ kickoffMs: now + 2 * HOUR }), now)).toBe('self-serve');
    expect(await noAnalysisReason(m({ kickoffMs: now + 3 * HOUR + 60_000 }), now)).toBe('scheduled');
    expect(await noAnalysisReason(m({ kickoffMs: now + 3 * HOUR }), now)).toBe('self-serve');
    // Lig bilgisi yoksa "hazırlanacak" sözü verilmez.
    expect(await noAnalysisReason(m({ leagueId: undefined }), now)).toBe('self-serve');
    // Başlamış / bitmiş / saati bilinmeyen maçta üretim mümkün değil → yönlendirme yok.
    expect(await noAnalysisReason(m({ status: 'IN PLAY', kickoffMs: now - HOUR }), now)).toBe('not-planned');
    expect(await noAnalysisReason(m({ status: 'FINISHED', kickoffMs: now - 3 * HOUR }), now)).toBe('not-planned');
    expect(await noAnalysisReason(m({ kickoffMs: now - 60_000 }), now)).toBe('not-planned');
    expect(await noAnalysisReason(m({ kickoffMs: null }), now)).toBe('not-planned');
  });

  it('açılmamış analiz: yalnız önizleme + açma teklifi; kilitli alanların HİÇBİRİ yanıtta yok', async () => {
    const card = await analysisCardForMatch(viewer(), match);
    expect(card.kind).toBe('locked');
    const json = JSON.stringify(card);
    for (const marker of LOCKED_MARKERS) expect(json).not.toContain(marker);
    expect(card).toMatchObject({ cost: 1, signedIn: true, preview: { top: { outcome: 'HOME', pct: 55 }, summary: ['Galatasaray baskıyla başlar.', 'Galatasaray daha baskın görünüyor.'] } });
    // Girişsiz de aynı: önizleme + giriş çağrısı.
    const anon = await analysisCardForMatch(null, match);
    expect(anon).toMatchObject({ kind: 'locked', signedIn: false });
    for (const marker of LOCKED_MARKERS) expect(JSON.stringify(anon)).not.toContain(marker);
  });

  it('açılmış / premium / yönetici / maç bitmiş → özet (en olası sonuç + noktalar); bahis cümlesi atılır', async () => {
    h.unlock = { id: 'u' };
    const card = await analysisCardForMatch(viewer(), match);
    expect(card).toMatchObject({ kind: 'summary', top: { outcome: 'HOME', pct: 55 } });
    const points = (card as { points: string[] }).points;
    expect(points[0]).toBe('Hücum kalitesi belirleyici olacak.');
    expect(points).toContain('İç saha formu ev sahibini öne çıkarıyor.');
    expect(findGamblingTerms(points.join(' '))).toEqual([]);
    expect(JSON.stringify(card)).not.toMatch(/GIZLI_SENARYO|GIZLI_TAKIM|3-1/);

    h.unlock = null;
    expect((await analysisCardForMatch(viewer({ premiumUntil: new Date(Date.now() + 86400_000) }), match)).kind).toBe('summary');
    expect((await analysisCardForMatch(viewer({ role: 'ADMIN' }), match)).kind).toBe('summary');
    h.finished = true;
    expect((await analysisCardForMatch(null, match)).kind).toBe('summary');
  });

  it('serbest metin: takma ad + fikstür; belirsiz takımda en çok 3 seçenek', async () => {
    const fx = (id: number, homeId: number, home: string, awayId: number, away: string) => ({ id, home: { id: homeId, name: home }, away: { id: awayId, name: away }, status: 'NOT STARTED', kickoff_ts: id });
    h.overview.set('34', { fixtures: [fx(19746594, 34, 'Galatasaray', 1071, 'Kasımpaşa')], recent: [] });
    const card = await answerMatchAnalysisRequest(viewer(), 'GS–Kasımpaşa maçını analiz et');
    expect(card).toMatchObject({ kind: 'locked', match: { id: 19746594 } });

    // Sözlükte olmayan ifade → mevcut takım araması; iki aday takım → seçenek.
    h.search.set('Real', [{ id: 3468, name: 'Real Madrid' }, { id: 10086, name: 'Real Madrid II' }]);
    h.overview.set('3468', { fixtures: [fx(1, 3468, 'Real Madrid', 34, 'Galatasaray')], recent: [] });
    h.overview.set('10086', { fixtures: [fx(2, 10086, 'Real Madrid II', 34, 'Galatasaray')], recent: [] });
    const choose = await answerMatchAnalysisRequest(viewer(), 'Real - GS analiz');
    expect(choose).toMatchObject({ kind: 'choose', options: [{ id: 1 }, { id: 2 }] });

    expect(await answerMatchAnalysisRequest(viewer(), 'Hiç Yok FK - GS analiz')).toEqual({ kind: 'team-not-found', query: 'Hiç Yok FK' });
    expect(await answerMatchAnalysisRequest(viewer(), 'merhaba')).toEqual({ kind: 'not-understood' });
    // Takma ad sözlüğü belirsizliği çözer ("Trabzon" → Trabzonspor), aramaya gidilmez.
    expect(resolveTeamFromAliases('Trabzon').map((t) => t.id)).toEqual([688]);
  });
});
