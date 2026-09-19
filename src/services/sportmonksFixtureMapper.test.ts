import { describe, it, expect } from 'vitest';
import { mapSportmonksFixtureToMatch } from './sportmonksFixtureMapper';
import type { SportmonksFixture } from './sportmonks/types';
import inplayFixture from './sportmonks/__fixtures__/inplayFixture.json';
import scoresInplay from './sportmonks/__fixtures__/scoresInplay.json';
import periodsLive from './sportmonks/__fixtures__/periodsLive.json';
import venueTurkishCup from './sportmonks/__fixtures__/venueTurkishCup.json';
import refereesTurkishCup from './sportmonks/__fixtures__/refereesTurkishCup.json';
import roundLaLiga from './sportmonks/__fixtures__/roundLaLiga.json';
import groupEuropaLeague from './sportmonks/__fixtures__/groupEuropaLeague.json';

describe('mapSportmonksFixtureToMatch', () => {
  it('Pass 1 gerçek örneğinden (fixture 19874789) temel alanları eşler', () => {
    const match = mapSportmonksFixtureToMatch(inplayFixture as SportmonksFixture);

    expect(match.id).toBe(19874789);
    expect(match.status).toBe('NOT STARTED'); // state_id 1 → NS
    expect(match.home).toEqual({ id: 255667, name: 'Orduspor 1967', logo: expect.stringContaining('255667.png') });
    expect(match.away).toEqual({ id: 249912, name: 'Torul Belediye Gençlik', logo: expect.stringContaining('team_placeholder.png') });
    expect(match.date).toBe('2026-09-17');
    expect(match.scheduled).toBe('16:00');
    // Pass 1: type her zaman "league" dönüyor, ayrım sub_type'ta — Türkiye Kupası "domestic_cup"
    expect(match.competition).toEqual({
      id: 606,
      name: 'Turkish Cup',
      logo: expect.stringContaining('606.png'),
      is_cup: true,
      is_league: false,
    });
    // fixture_id bilinçli olarak set edilmiyor (Pass 1 Genel Bulgu 2)
    expect(match.fixture_id).toBeUndefined();
  });

  it('Pass 1-3 gerçek örneklerinden (scores/periods/venue/referees/round) türetilen alanları birleştirir', () => {
    // NOT: raporun hiçbir tek isteği bu include'ların hepsini AYNI ANDA döndürmedi
    // (her biri ayrı bir pass'te, ayrı bir fixture'da test edildi — bkz.
    // __fixtures__/README.md). Burada her biri gerçek/rapor-kayıtlı değeriyle,
    // sadece mapper'ın TÜM alanları doğru anahtara yazdığını doğrulamak için
    // tek bir sentetik composite'e birleştiriliyor.
    const composite: SportmonksFixture = {
      ...(inplayFixture as SportmonksFixture),
      scores: scoresInplay as SportmonksFixture['scores'],
      periods: periodsLive as SportmonksFixture['periods'],
      venue: venueTurkishCup as SportmonksFixture['venue'],
      referees: refereesTurkishCup as SportmonksFixture['referees'],
      round: roundLaLiga as SportmonksFixture['round'],
    };

    const match = mapSportmonksFixtureToMatch(composite);

    expect(match.scores).toEqual({ score: '0-0', ht_score: '0-0' });
    expect(match.time).toBe("11'"); // periodsLive: minutes:11, ticking:true
    expect(match.location).toBe('Amasya 12 Haziran Stadyumu, Amasya');
    expect(match.referee).toBe('Şahin Berker'); // type_id 6 (orta hakem)
    expect(match.round).toBe('6'); // roundLaLiga.name
    expect(match.stage).toBeUndefined(); // composite'te stage yok
  });

  it('Pass 3 Soru 3: knockout fikstüründe round null, stage.name kullanılır', () => {
    const match = mapSportmonksFixtureToMatch({
      ...(inplayFixture as SportmonksFixture),
      round: null,
      stage: { name: 'Semi-finals' },
    });
    expect(match.round).toBeUndefined();
    expect(match.stage).toBe('Semi-finals');
  });

  it('Faz 4 (Pass 3 Soru 2, taze 2026-09-18 doğrulaması): grup aşamalı gerçek fixture group_name/group_id\'yi eşler', () => {
    // Daha önce sportmonksFixtureMapper.test.ts'te HİÇ test edilmemiş bir dal —
    // group_name/group_id mapping'i (mapper.ts:108-109). 2022/23 Avrupa Ligi
    // Grup A (Zürich vs Arsenal, fixture 18674352) ile kapatıldı.
    const match = mapSportmonksFixtureToMatch(groupEuropaLeague as SportmonksFixture);
    expect(match.group_name).toBe('Group A');
    expect(match.group_id).toBe(247770);
    expect(match.home).toEqual(expect.objectContaining({ id: 389, name: 'Zürich' }));
    expect(match.away).toEqual(expect.objectContaining({ id: 19, name: 'Arsenal' }));
  });

  it('group hiç yoksa group_name/group_id set edilmez', () => {
    const match = mapSportmonksFixtureToMatch(inplayFixture as SportmonksFixture);
    expect(match.group_name).toBeUndefined();
    expect(match.group_id).toBeUndefined();
  });

  it('participants/league eksikse güvenli varsayılanlara düşer', () => {
    const match = mapSportmonksFixtureToMatch({ id: 42 });
    expect(match.status).toBe('NOT STARTED');
    expect(match.home).toEqual({ id: 0, name: '' });
    expect(match.away).toEqual({ id: 0, name: '' });
    expect(match.competition).toBeUndefined();
    expect(match.scores).toBeUndefined();
    expect(match.time).toBe('');
  });
});
