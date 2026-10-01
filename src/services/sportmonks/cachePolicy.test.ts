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

  it('tekil maç: canlı 20 sn, bitmiş 6 sa → 1 günden eskiyse 24 sa, yok → 1 sa', () => {
    expect(sportmonksCacheTtl('football/fixtures/19746594', { state_id: LIVE_1ST, starting_at: at(-20) }, NOW).fresh).toBe(20);
    expect(sportmonksCacheTtl('football/fixtures/19746594', { state_id: FT, starting_at: at(-150) }, NOW).fresh).toBe(6 * 3600);
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

  it('stale (Redis tutma) süresi taze süreden uzun', () => {
    const t = sportmonksCacheTtl('football/fixtures/date/2026-09-30', [], NOW);
    expect(t.stale).toBeGreaterThan(t.fresh);
  });
});
