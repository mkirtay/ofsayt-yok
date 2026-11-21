import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { buildMatchSeo, matchStartDateIso, normalizeScore } from './matchSeo';

const brand = (t: string) => `${t} | Scor3`;
const base = {
  id: 1,
  time: '',
  home: { id: 1, name: 'Galatasaray' },
  away: { id: 2, name: 'Fenerbahçe' },
  competition: { id: 600, name: 'Süper Lig' },
  date: '2026-11-22',
  scheduled: '16:00',
  round: '13',
} as unknown as Match;

describe('matchStartDateIso', () => {
  it('saat biliniyorsa TSİ ofsetli tam ISO, TBD ise yalnız tarih', () => {
    expect(matchStartDateIso(base)).toBe('2026-11-22T19:00:00+03:00');
    expect(matchStartDateIso({ ...base, time_tbd: true })).toBe('2026-11-22');
    expect(matchStartDateIso({ ...base, scheduled: '' })).toBe('2026-11-22');
    expect(matchStartDateIso(null)).toBeNull();
  });
});

describe('buildMatchSeo', () => {
  it('görünen lig adı verilirse sağlayıcı adının yerine her yerde o kullanılır', () => {
    const s = buildMatchSeo({ ...base, status: 'NOT STARTED', competition: { id: 600, name: 'Super Lig' } } as Match, brand, { competitionName: 'Süper Lig' });
    expect(s.h1).toBe('Galatasaray - Fenerbahçe · Süper Lig');
    expect(s.description).toContain('(Süper Lig)');
    expect(`${s.title} ${s.description} ${s.h1} ${s.summary.join(' ')}`).not.toContain('Super Lig');
  });

  it('açıklama 155 karakteri geçmez; kanal bilgisi puan durumundan önce gelir', () => {
    const s = buildMatchSeo({ ...base, status: 'NOT STARTED', tv_stations: ['TOD', 'beIN CONNECT Turkey', 'Digiturk Play'] }, brand);
    expect(s.description.length).toBeLessThanOrEqual(155);
    expect(s.description).toContain('Digiturk Play ekranlarında oynanacak.');
  });

  it('oynanmamış maç: ne zaman / saat kaçta başlığı, TSİ saat, yayıncı', () => {
    const s = buildMatchSeo({ ...base, status: 'NOT STARTED', tv_stations: ['beIN Sports 1'], venue_info: { name: 'RAMS Park', city: 'İstanbul' } }, brand);
    expect(s.title).toBe('Galatasaray - Fenerbahçe Maçı Ne Zaman, Saat Kaçta, Hangi Kanalda? | Scor3');
    expect(buildMatchSeo({ ...base, status: 'NOT STARTED' }, brand).title).toBe('Galatasaray - Fenerbahçe Maçı Ne Zaman, Saat Kaçta? | Scor3');
    expect(s.h1).toBe('Galatasaray - Fenerbahçe · Süper Lig');
    const text = s.summary.join(' ');
    expect(text).toContain('22 Kasım 2026 Pazar, saat 19:00 (TSİ) karşı karşıya');
    expect(text).toContain('13. hafta');
    expect(text).toContain('Stadyum: RAMS Park (İstanbul).');
    expect(text).toContain('karşı karşıya gelecek; maç beIN Sports 1 ekranlarından yayınlanacak.');
    expect(s.description).toContain('beIN Sports 1 ekranlarında oynanacak');
    expect(s.description).toContain('puan durumu');
    expect(s.description.length).toBeLessThanOrEqual(155);
  });

  it('bitmiş maç: skorlu maç sonucu başlığı', () => {
    const s = buildMatchSeo({ ...base, status: 'FINISHED', scores: { score: '2 - 1' } }, brand);
    // Kademeli: "…: İstatistik ve Puan Durumu | Scor3" 61 karakter → bir sonraki kademe.
    expect(s.title).toBe('Galatasaray 2-1 Fenerbahçe Maç Sonucu ve İstatistik');
    expect(s.description).toBe('Galatasaray 2-1 Fenerbahçe (Süper Lig, 22 Kasım 2026) maç sonucu: goller, maç istatistikleri, kadrolar ve Süper Lig puan durumu.');
    expect(buildMatchSeo({ ...base, home: { id: 1, name: 'Inter' }, away: { id: 2, name: 'Milan' }, status: 'FINISHED', scores: { score: '2-1' } } as never, brand).title).toBe(
      'Inter 2-1 Milan: İstatistik ve Puan Durumu | Scor3',
    );
    expect(
      buildMatchSeo({ ...base, home: { id: 1, name: 'İstanbul Başakşehir FK' }, away: { id: 2, name: 'Gaziantep F.K.' }, status: 'FINISHED', scores: { score: '1-1' } } as never, brand)
        .title.length,
    ).toBeLessThanOrEqual(60);
    expect(s.h1).toBe('Galatasaray 2-1 Fenerbahçe');
    expect(s.summary[0]).toContain('maç 2-1 sona erdi');
  });

  it('bitmiş maç: gol atanlar cümlesi (penaltı, kendi kalesine, iptal edilen gol yok); hakem bağlantıyla yazılıyorsa özette yok', () => {
    const ev = (event: string, time: number, is_home: boolean, name: string, rescinded?: true) => ({
      event, time, is_home, player: { id: 1, name }, ...(rescinded ? { rescinded } : {}),
    });
    const s = buildMatchSeo({ ...base, status: 'FINISHED', scores: { score: '2-1' }, referee: 'Ali Şansalan' }, brand, {
      events: [ev('GOAL', 23, true, 'Icardi'), ev('PENALTY', 67, true, 'Osimhen'), ev('GOAL', 80, false, 'Dzeko'), ev('GOAL', 88, false, 'Tadic', true), ev('OWN_GOAL', 90, false, 'Sanchez'), ev('YELLOW_CARD', 10, true, 'Torreira')],
      omitReferee: true,
    });
    const text = s.summary.join(' ');
    expect(text).toContain("Goller: Icardi 23', Osimhen 67' (pen.) (Galatasaray); Dzeko 80' (Fenerbahçe). Kendi kalesine: Sanchez 90'.");
    expect(text).not.toContain('Tadic');
    expect(text).not.toContain('Hakem');
  });

  it('canlı maç ve ertelenen maç', () => {
    const live = buildMatchSeo({ ...base, status: 'IN PLAY', scores: { score: '0-0' } }, brand);
    expect(live.title).toBe('Galatasaray - Fenerbahçe Canlı Skor (0-0) ve İstatistik');
    expect(live.description).toContain('canlı puan durumu');
    expect(live.description.length).toBeLessThanOrEqual(155);
    const p = buildMatchSeo({ ...base, status: 'NOT STARTED', state_code: 'POSTPONED' }, brand);
    expect(p.summary[0]).toContain('henüz kesinleşmedi');
  });

  it('takım adı yoksa genel metin, özet yok', () => {
    const s = buildMatchSeo(null, brand);
    expect(s.title).toBe('Maç Detayı | Scor3');
    expect(s.summary).toEqual([]);
  });

  it('normalizeScore', () => {
    expect(normalizeScore('3 - 0')).toBe('3-0');
    expect(normalizeScore('?-?')).toBeNull();
    expect(normalizeScore(undefined)).toBeNull();
  });
});
