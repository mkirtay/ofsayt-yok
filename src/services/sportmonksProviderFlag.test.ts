import { describe, it, expect, afterEach } from 'vitest';
import {
  isSportmonksProviderEnabled,
  legacyToStandingsLeagueId,
  resolveLegacyCompetitionId,
  resolveSportmonksLeagueId,
  toStandingsCompetitionId,
} from './sportmonksProviderFlag';

describe('isSportmonksProviderEnabled', () => {
  const original = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = original;
  });

  it('varsayılan (unset) durumda false döner — legacy davranış varsayılan kalır', () => {
    delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    expect(isSportmonksProviderEnabled()).toBe(false);
  });

  it('"true" dışındaki değerlerde false döner', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'TRUE';
    expect(isSportmonksProviderEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = '1';
    expect(isSportmonksProviderEnabled()).toBe(false);
  });

  it('tam olarak "true" iken açılır', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(isSportmonksProviderEnabled()).toBe(true);
  });
});

describe('resolveSportmonksLeagueId', () => {
  it('Pass 4 doğrulanan eşleme: UEFA_CHAMPIONS_LEAGUE_ID (244) → Sportmonks league_id 2', () => {
    expect(resolveSportmonksLeagueId(244)).toBe(2);
    expect(resolveSportmonksLeagueId('244')).toBe(2);
  });

  it('2026-09-18 doğrulama turunda eklenen Türkiye eşlemeleri (gerçek fixture + takım adı çapraz kontrolüyle)', () => {
    expect(resolveSportmonksLeagueId(6)).toBe(600); // Trendyol Süper Lig
    expect(resolveSportmonksLeagueId(344)).toBe(603); // Trendyol 1. Lig
    expect(resolveSportmonksLeagueId(347)).toBe(606); // Türkiye Kupası
  });

  it('2026-09-18 doğrulama turunda eklenen Büyük 5 + UEFA eşlemeleri', () => {
    expect(resolveSportmonksLeagueId(2)).toBe(8); // Premier League (England — 609/Ukraine ile karıştırılmadı)
    expect(resolveSportmonksLeagueId(1)).toBe(82); // Bundesliga (Germany — 85/2.Bundesliga değil)
    expect(resolveSportmonksLeagueId(3)).toBe(564); // La Liga (Spain — Pass 1'de zaten kullanılmıştı)
    expect(resolveSportmonksLeagueId(4)).toBe(384); // Serie A (Italy — 648/Brazil ile karıştırılmadı)
    expect(resolveSportmonksLeagueId(5)).toBe(301); // Ligue 1 (France)
    expect(resolveSportmonksLeagueId(245)).toBe(5); // UEFA Avrupa Ligi
    expect(resolveSportmonksLeagueId(446)).toBe(2286); // UEFA Konferans Ligi
  });

  it('doğrulanamayan competition_id için null döner (tahmini id uydurmak yerine)', () => {
    // WORLD_CUP_COMPETITION_ID — GET /leagues/search/World%20Cup bu hesabın planında
    // erişim vermiyor (Pass 3 ile aynı bulgu), bilinçli olarak eklenmedi.
    expect(resolveSportmonksLeagueId(362)).toBeNull();
  });

  it('geçersiz girişte null döner', () => {
    expect(resolveSportmonksLeagueId('not-a-number')).toBeNull();
  });
});

describe('resolveLegacyCompetitionId (Sportmonks league_id → legacy competition_id)', () => {
  it('doğrulanmış eşlemelerin tersini verir', () => {
    expect(resolveLegacyCompetitionId(600)).toBe(6); // Süper Lig
    expect(resolveLegacyCompetitionId(5)).toBe(245); // Avrupa Ligi
    expect(resolveLegacyCompetitionId(2)).toBe(244); // Şampiyonlar Ligi
    expect(resolveLegacyCompetitionId(301)).toBe(5); // Ligue 1
  });
  it('eşlemesi olmayan / geçersiz id için null', () => {
    expect(resolveLegacyCompetitionId(999999)).toBeNull();
    expect(resolveLegacyCompetitionId('x')).toBeNull();
  });
  it('her eşleme çift yönlü tutarlı (round-trip)', () => {
    for (const legacy of [244, 245, 446, 6, 344, 347, 2, 1, 3, 4, 5]) {
      expect(resolveLegacyCompetitionId(resolveSportmonksLeagueId(legacy)!)).toBe(legacy);
    }
  });
});

describe('toStandingsCompetitionId / legacyToStandingsLeagueId — puan durumu id uzayı', () => {
  const original = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = original;
  });

  it('maç competition.id olduğu gibi geçer: Süper Lig 600, 2. Lig Kırmızı 1283 (legacy tablosunda yok) — null DÖNMEZ', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(toStandingsCompetitionId(600)).toBe(600);
    expect(toStandingsCompetitionId('1283')).toBe(1283);
    expect(toStandingsCompetitionId(609)).toBe(609);
    expect(toStandingsCompetitionId(362)).toBe(362);
  });

  it('geçersiz / boş id null', () => {
    expect(toStandingsCompetitionId(null)).toBeNull();
    expect(toStandingsCompetitionId(undefined)).toBeNull();
    expect(toStandingsCompetitionId('abc')).toBeNull();
  });

  it('legacy giriş (yan panel/compare/standings sayfası): Sportmonks açıkken tek noktada çevrilir', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(legacyToStandingsLeagueId(6)).toBe(600);
    expect(legacyToStandingsLeagueId('244')).toBe(2);
    expect(legacyToStandingsLeagueId(362)).toBe(362);
  });

  it('çakışan legacy id sessizce yanlış lige gitmez; eşlemesizse null', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(legacyToStandingsLeagueId(5)).toBe(301); // legacy 5 = Ligue 1 (Sportmonks 5 = Avrupa Ligi DEĞİL)
    expect(legacyToStandingsLeagueId(99999)).toBeNull();
  });

  it('Sportmonks kapalıyken id zaten legacy — değişmeden döner', () => {
    delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    expect(toStandingsCompetitionId(6)).toBe(6);
    expect(legacyToStandingsLeagueId('245')).toBe(245);
  });
});
