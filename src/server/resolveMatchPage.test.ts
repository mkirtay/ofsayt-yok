import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Match } from '@/models/liveScore';

/**
 * `/matches/[slug]` SSR kararı. Belirsiz bölgede (eski livescore id'leri ile eski UEFA sezonlarının
 * Sportmonks id'leri çakışıyor) karar URL slug'ının birebir karşılaştırmasıyla veriliyor.
 * Gerçek `resolveSportmonksMatch` (negatif cache dahil) kullanılıyor; yalnızca upstream ve cache sahte.
 */

const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  stored: new Map<string, { homeTeamName: string | null; awayTeamName: string | null }>(),
  cache: new Map<string, { value: unknown; ttl: number }>(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/sportmonksProviderFlag', () => ({ isSportmonksProviderEnabled: () => true }));
vi.mock('@/services/liveScoreService', () => ({
  lookupSportmonksFixture: h.lookup,
  findMatchById: vi.fn(),
  findMatchByTeamIds: vi.fn(),
  getMatchWithEvents: vi.fn(),
}));
vi.mock('@/lib/livescoreCache', () => ({
  readCache: vi.fn(async (key: string) => h.cache.get(key)?.value ?? null),
  writeCache: vi.fn(async (key: string, value: unknown, ttl: number) => void h.cache.set(key, { value, ttl })),
}));
vi.mock('@/server/storedMatch', () => ({
  findStoredMatchInfo: vi.fn(async (id: string) => h.stored.get(id) ?? null),
}));

import { resolveMatchPage } from './resolveMatchPage';

// GS–Real Madrid, Şampiyonlar Ligi çeyrek final 2013 — gerçek Sportmonks id'si (2026-09-30 doğrulandı).
const GS_REAL_2013 = '1058753';
const gsReal: Match = {
  id: 1058753,
  status: 'FINISHED',
  time: '',
  home: { id: 3468, name: 'Real Madrid' },
  away: { id: 34, name: 'Galatasaray' },
} as Match;

describe('resolveMatchPage — belirsiz bölge (eski id aralığı)', () => {
  beforeEach(() => {
    h.lookup.mockReset();
    h.stored.clear();
    h.cache.clear();
  });

  it('1058753 doğru slug ile → gerçek maç sayfası', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: gsReal, events: [] });
    const r = await resolveMatchPage(GS_REAL_2013, 'real-madrid-galatasaray');
    expect(r).toEqual({ kind: 'match', match: gsReal, events: [] });
  });

  it('slug karşılaştırması büyük/küçük harf ve Türkçe karakter/yüzde-kodu normalize eder', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: gsReal, events: [] });
    expect((await resolveMatchPage(GS_REAL_2013, 'Real-Madrid-GALATASARAY')).kind).toBe('match');

    const fb: Match = { ...gsReal, id: 1059999, home: { id: 88, name: 'Fenerbahçe' }, away: { id: 1, name: 'İstanbul Başakşehir' } } as Match;
    h.lookup.mockResolvedValue({ kind: 'found', match: fb, events: [] });
    // Sitenin ürettiği biçim (buildMatchSlug) ve elle/yüzde-kodlu yazılmış Türkçe biçim aynı sonuca iner.
    const { buildMatchSlug } = await import('@/utils/matchUrl');
    expect((await resolveMatchPage('1059999', buildMatchSlug(fb))).kind).toBe('match');
    expect((await resolveMatchPage('1059999', encodeURIComponent('Fenerbahçe-İstanbul-Başakşehir'))).kind).toBe('match');
  });

  it('aynı id eski livescore tarzı (başka takımların) slug ile → 410', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: gsReal, events: [] });
    expect(await resolveMatchPage(GS_REAL_2013, 'besiktas-bursaspor')).toEqual({ kind: 'gone' });
  });

  it('bulanık eşleştirme yok: kısmi / eksik slug → 410', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: gsReal, events: [] });
    expect((await resolveMatchPage(GS_REAL_2013, 'real-madrid')).kind).toBe('gone');
    expect((await resolveMatchPage(GS_REAL_2013, 'real-madrid-galatasaray-as')).kind).toBe('gone');
  });

  it('slug\'sız URL → gerçek maç', async () => {
    h.lookup.mockResolvedValue({ kind: 'found', match: gsReal, events: [] });
    expect(await resolveMatchPage(GS_REAL_2013, '')).toEqual({ kind: 'match', match: gsReal, events: [] });
  });

  it('DB içeriği olan eski id (slug takımlarla uyuşuyor) → arşiv, Sportmonks\'a gitmez', async () => {
    h.stored.set('1825339', { homeTeamName: 'Mexico', awayTeamName: 'South Africa' });
    expect(await resolveMatchPage('1825339', 'mexico-south-africa')).toEqual({ kind: 'archived' });
    expect(await resolveMatchPage('1825339', '')).toEqual({ kind: 'archived' });
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it('DB içeriği takım adsızsa (yalnız trivia) → slug\'a bakmadan arşiv', async () => {
    h.stored.set('700500', { homeTeamName: null, awayTeamName: null });
    expect(await resolveMatchPage('700500', 'herhangi-bir-slug')).toEqual({ kind: 'archived' });
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it('eski analiz aynı id\'li H2H linkini ele geçirmez: slug uyuşmazsa Sportmonks maçı açılır', async () => {
    h.stored.set(GS_REAL_2013, { homeTeamName: 'Kasimpasa', awayTeamName: 'Rizespor' });
    h.lookup.mockResolvedValue({ kind: 'found', match: gsReal, events: [] });
    expect(await resolveMatchPage(GS_REAL_2013, 'real-madrid-galatasaray')).toEqual({ kind: 'match', match: gsReal, events: [] });
    expect(await resolveMatchPage(GS_REAL_2013, 'kasimpasa-rizespor')).toEqual({ kind: 'archived' });
  });

  it('Sportmonks\'ta olmayan id → 410 ve 24 saatlik negatif cache (ikinci istek upstream\'e gitmez)', async () => {
    h.lookup.mockResolvedValue({ kind: 'missing' });

    expect(await resolveMatchPage('700001', 'eski-mac')).toEqual({ kind: 'gone' });
    expect(await resolveMatchPage('700001', 'eski-mac')).toEqual({ kind: 'gone' });

    expect(h.lookup).toHaveBeenCalledTimes(1);
    expect(h.cache.get('dev:v2:sportmonks:fixture-missing:700001')?.ttl).toBe(24 * 60 * 60);
  });

  it('geçici hata → error (410 verilmez, cache\'lenmez)', async () => {
    h.lookup.mockResolvedValue({ kind: 'error' });
    expect(await resolveMatchPage('700002', 'eski-mac')).toEqual({ kind: 'error' });
    expect(h.cache.size).toBe(0);
  });
});

describe('resolveMatchPage — kesin Sportmonks id (≥10M)', () => {
  beforeEach(() => {
    h.lookup.mockReset();
    h.cache.clear();
  });

  it('slug kontrolü yok (takım adı değişse de sayfa açılır); "yok" → missing + 1 sa negatif cache', async () => {
    const current = { ...gsReal, id: 19443204 } as Match;
    h.lookup.mockResolvedValueOnce({ kind: 'found', match: current, events: [] });
    expect((await resolveMatchPage('19443204', 'eski-takim-adi')).kind).toBe('match');

    h.lookup.mockResolvedValueOnce({ kind: 'missing' });
    expect(await resolveMatchPage('19999999', '')).toEqual({ kind: 'missing' });
    expect(h.cache.get('dev:v2:sportmonks:fixture-missing:19999999')?.ttl).toBe(60 * 60);
  });
});
