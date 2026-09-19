import { describe, it, expect, afterEach } from 'vitest';
import {
  isSportmonksProviderEnabled,
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

describe('toStandingsCompetitionId — maç competition.id → puan durumu için legacy id (P0 "Puan tablosu bulunamadı")', () => {
  const original = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = original;
  });

  it('Sportmonks açıkken Süper Lig fikstürü (600) legacy 6\'ya çevrilir — 600 çevrilmeden geçilirse tablo hiç bulunamazdı', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(toStandingsCompetitionId(600)).toBe(6);
    expect(resolveSportmonksLeagueId(toStandingsCompetitionId(600)!)).toBe(600);
  });

  it('çakışan id sessizce yanlış lige gitmez: Sportmonks 5 (Avrupa Ligi) → 245, Ligue 1 (legacy 5) DEĞİL', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(toStandingsCompetitionId(5)).toBe(245);
    expect(resolveSportmonksLeagueId(toStandingsCompetitionId(5)!)).toBe(5);
  });

  it('eşlemesi olmayan lig null (yanlış tablo yerine tablo yok); Dünya Kupası (362) olduğu gibi geçer', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(toStandingsCompetitionId(609)).toBeNull();
    expect(toStandingsCompetitionId(362)).toBe(362);
    expect(toStandingsCompetitionId(null)).toBeNull();
    expect(toStandingsCompetitionId(undefined)).toBeNull();
  });

  it('Sportmonks kapalıyken id zaten legacy — değişmeden döner', () => {
    delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    expect(toStandingsCompetitionId(6)).toBe(6);
    expect(toStandingsCompetitionId('245')).toBe(245);
  });
});
