import { describe, it, expect } from 'vitest';
import { sportmonksCacheTtl, fixtureListFreshSeconds } from './cachePolicy';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const at = (minutesFromNow: number) =>
  new Date(NOW + minutesFromNow * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const NS = 1;
const LIVE_1ST = 2;
const HT = 3;
const FT = 5;

describe('sportmonksCacheTtl — TTL tablosu', () => {
  it('canlı skor 20 sn (boş "sonuç yok" cevabı da)', () => {
    expect(sportmonksCacheTtl('football/livescores/inplay', [], NOW).fresh).toBe(20);
    expect(sportmonksCacheTtl('football/livescores/inplay', undefined, NOW).fresh).toBe(20);
  });

  it('bugün: canlı maç ya da ±15 dk içinde başlama → 30 sn', () => {
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', [{ state_id: LIVE_1ST, starting_at: at(-30) }], NOW).fresh).toBe(30);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', [{ state_id: HT, starting_at: at(-50) }], NOW).fresh).toBe(30);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', [{ state_id: NS, starting_at: at(10) }], NOW).fresh).toBe(30);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', [{ state_id: NS, starting_at: at(-5) }], NOW).fresh).toBe(30);
  });

  it('bugün, maç yok ya da hepsi uzak → en fazla 5 dk', () => {
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', undefined, NOW).fresh).toBe(300);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', [{ state_id: FT, starting_at: at(-300) }], NOW).fresh).toBe(300);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-30', [{ state_id: NS, starting_at: at(240) }], NOW).fresh).toBe(300);
  });

  it('UTC yarın (gece maçları için her gün okunur): içeriğe bakar, tavan 15 dk', () => {
    expect(sportmonksCacheTtl('football/fixtures/date/2026-10-01', [], NOW).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-10-01', [{ state_id: NS, starting_at: at(25) }], NOW).fresh).toBe(600);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-10-01', [{ state_id: NS, starting_at: at(5) }], NOW).fresh).toBe(30);
  });

  it('sıradaki başlamaya (−15 dk) kadar: 18 dk sonra başlayacak maç → 3 dk', () => {
    expect(fixtureListFreshSeconds([{ state_id: NS, starting_at: at(18) }], 300, NOW)).toBe(180);
  });

  it('saatler önce ertelenmiş (hâlâ NS) maç listeyi 30 sn\'ye kilitlemez', () => {
    expect(fixtureListFreshSeconds([{ state_id: NS, starting_at: at(-6 * 60) }], 300, NOW)).toBe(300);
  });

  it('gelecek günler 15 dk, geçmiş günler 24 sa; dün hâlâ içeriğe bakar (gece yarısını geçen maçlar)', () => {
    expect(sportmonksCacheTtl('football/fixtures/date/2026-10-03', [], NOW).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-20', [], NOW).fresh).toBe(86400);
    expect(sportmonksCacheTtl('football/fixtures/date/2026-09-29', [{ state_id: LIVE_1ST, starting_at: at(-100) }], NOW).fresh).toBe(30);
  });

  it('between: tamamen geçmiş 24 sa, gelecek 15 dk, bugünü içeren içeriğe göre (en fazla 10 dk)', () => {
    const inc = { include: 'participants;scores' };
    expect(sportmonksCacheTtl('football/fixtures/between/2026-06-01/2026-08-01/34', [], NOW, inc).fresh).toBe(86400);
    expect(sportmonksCacheTtl('football/fixtures/between/2026-10-05/2026-12-01', [], NOW, inc).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/fixtures/between/2026-07-03/2026-09-30/34', [{ state_id: FT, starting_at: at(-3000) }], NOW, inc).fresh).toBe(600);
    expect(sportmonksCacheTtl('football/fixtures/between/2026-09-29/2026-10-30', [{ state_id: LIVE_1ST, starting_at: at(-20) }], NOW, inc).fresh).toBe(30);
  });

  it('between include\'suz (yalnız takvim): bugünü/canlı maçı içerse de 15 dk; tamamen geçmişse 24 sa', () => {
    const live = [{ state_id: LIVE_1ST, starting_at: at(-20) }];
    expect(sportmonksCacheTtl('football/fixtures/between/2026-09-29/2026-10-30', live, NOW).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/fixtures/between/2026-09-29/2026-10-30', live, NOW, { filters: 'fixtureLeagues:600', order: 'asc' }).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/fixtures/between/2026-06-01/2026-08-01', [], NOW).fresh).toBe(86400);
  });

  it('tekil maç: canlı 20 sn, yeni biten (başlamadan sonraki 5 sa) 15 dk, sonra 6 sa → 1 günden eskiyse 24 sa, yok → 1 sa', () => {
    expect(sportmonksCacheTtl('football/fixtures/19746594', { state_id: LIVE_1ST, starting_at: at(-20) }, NOW).fresh).toBe(20);
    expect(sportmonksCacheTtl('football/fixtures/19746594', { state_id: FT, starting_at: at(-150) }, NOW).fresh).toBe(15 * 60);
    expect(sportmonksCacheTtl('football/fixtures/19746594', { state_id: FT, starting_at: at(-299) }, NOW).fresh).toBe(15 * 60);
    expect(sportmonksCacheTtl('football/fixtures/19746594', { state_id: FT, starting_at: at(-301) }, NOW).fresh).toBe(6 * 3600);
    expect(sportmonksCacheTtl('football/fixtures/1058753', { state_id: FT, starting_at: '2013-04-03 18:45:00' }, NOW).fresh).toBe(86400);
    expect(sportmonksCacheTtl('football/fixtures/19999999', undefined, NOW)).toEqual({ fresh: 3600, stale: 3600 });
  });

  it('puan durumu 10 dk, gol krallığı 30 dk, takım/kadro/oyuncu 6 sa, lig/sezon/type 24 sa', () => {
    expect(sportmonksCacheTtl('football/standings/seasons/28203', [], NOW).fresh).toBe(600);
    expect(sportmonksCacheTtl('football/topscorers/seasons/28203', [], NOW).fresh).toBe(1800);
    expect(sportmonksCacheTtl('football/squads/seasons/1/teams/34', [], NOW).fresh).toBe(6 * 3600);
    expect(sportmonksCacheTtl('football/players/455805', { id: 1 }, NOW).fresh).toBe(6 * 3600);
    expect(sportmonksCacheTtl('football/teams/34', { id: 34 }, NOW).fresh).toBe(6 * 3600);
    expect(sportmonksCacheTtl('football/teams/34', { id: 34, upcoming: [] }, NOW).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/leagues/600', { id: 600 }, NOW).fresh).toBe(86400);
    expect(sportmonksCacheTtl('core/types', [], NOW).fresh).toBe(86400);
  });

  it('takım latest/upcoming: canlı ya da başlamaya ±15 dk → 30 sn; yoksa sıradaki maça kadar, en çok 15 dk', () => {
    const team = (latest: object[], upcoming: object[]) => ({ id: 34, latest, upcoming });
    const finished = { state_id: FT, starting_at: at(-3 * 24 * 60) };
    // canlı maç latest'te
    expect(sportmonksCacheTtl('football/teams/34', team([{ state_id: LIVE_1ST, starting_at: at(-30) }, finished], []), NOW).fresh).toBe(30);
    // canlı maç upcoming'de
    expect(sportmonksCacheTtl('football/teams/34', team([finished], [{ state_id: HT, starting_at: at(-50) }]), NOW).fresh).toBe(30);
    // başlamaya 10 dk / başlama saati 5 dk geçmiş ama hâlâ NS
    expect(sportmonksCacheTtl('football/teams/34', team([finished], [{ state_id: NS, starting_at: at(10) }]), NOW).fresh).toBe(30);
    expect(sportmonksCacheTtl('football/teams/34', team([finished], [{ state_id: NS, starting_at: at(-5) }]), NOW).fresh).toBe(30);
    // sıradaki maç 20 dk sonra → 5 dk (başlamadan 15 dk önceye kadar)
    expect(sportmonksCacheTtl('football/teams/34', team([finished], [{ state_id: NS, starting_at: at(20) }]), NOW).fresh).toBe(300);
    // sıradaki maç günler sonra / hiç yok → 15 dk
    expect(sportmonksCacheTtl('football/teams/34', team([finished], [{ state_id: NS, starting_at: at(3 * 24 * 60) }]), NOW).fresh).toBe(900);
    expect(sportmonksCacheTtl('football/teams/34', team([finished], []), NOW).fresh).toBe(900);
    // yalnız latest (upcoming anahtarı yok) da maç listesi sayılır
    expect(sportmonksCacheTtl('football/teams/34', { id: 34, latest: [finished] }, NOW).fresh).toBe(900);
    // include'suz takım yanıtı eskisi gibi 6 sa
    expect(sportmonksCacheTtl('football/teams/34', { id: 34 }, NOW).fresh).toBe(6 * 3600);
  });

  it('takım sezon istatistikleri 1 sa', () => {
    expect(sportmonksCacheTtl('football/teams/34', { id: 34, statistics: [{ season_id: 28203, season: { finished: false } }] }, NOW).fresh).toBe(3600);
    expect(sportmonksCacheTtl('football/teams/34', { id: 34, statistics: [] }, NOW).fresh).toBe(3600);
  });

  it('bitmiş sezon (program, takım istatistiği, oyuncu istatistiği) CDN + Redis 30 gün; sürmekte olan sezon eski kural', () => {
    const MONTH = 30 * 86400;
    const done = { finished: true };
    const live = { finished: false };
    // sezon programı
    expect(sportmonksCacheTtl('football/schedules/seasons/25682/teams/34', [done, done], NOW)).toEqual({ fresh: MONTH, stale: MONTH });
    expect(sportmonksCacheTtl('football/schedules/seasons/28203/teams/34', [done, live], NOW).fresh).toBe(300);
    expect(sportmonksCacheTtl('football/schedules/seasons/28203/teams/34', [], NOW).fresh).toBe(300);
    // takım istatistikleri: bütün sezonlar bitmişse
    const stats = (...seasons: object[]) => ({ id: 34, statistics: seasons.map((season, i) => ({ season_id: i, season })) });
    expect(sportmonksCacheTtl('football/teams/34', stats(done, done, done), NOW)).toEqual({ fresh: MONTH, stale: MONTH });
    expect(sportmonksCacheTtl('football/teams/34', stats(done, live), NOW).fresh).toBe(3600);
    // oyuncu sezon istatistikleri (player.statistics.season ile)
    const squad = (season?: object) => [{ player_id: 1, player: { statistics: [{ season_id: 1, ...(season ? { season } : {}) }] } }];
    expect(sportmonksCacheTtl('football/squads/seasons/25682/teams/34', squad(done), NOW)).toEqual({ fresh: MONTH, stale: MONTH });
    expect(sportmonksCacheTtl('football/squads/seasons/28203/teams/34', squad(live), NOW).fresh).toBe(6 * 3600);
    // Kadro sekmesinin isteği (season include'u yok) eskisi gibi 6 sa
    expect(sportmonksCacheTtl('football/squads/seasons/25682/teams/34', squad(), NOW).fresh).toBe(6 * 3600);
  });

  it('stale (Redis tutma) süresi taze süreden uzun', () => {
    const t = sportmonksCacheTtl('football/fixtures/date/2026-09-30', [], NOW);
    expect(t.stale).toBeGreaterThan(t.fresh);
  });
});
