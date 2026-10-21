import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/teamStatistics.profile.gs-2026-10-21.json';
import type { SportmonksTeamWithStatistics } from './teamSeasonStats';
import { combineSeasonProfiles, mapTeamSeasonProfiles, seasonProfileMetrics, type ProfileMetric } from './teamSeasonProfile';

// Gerçek yanıt (2026-10-21, GS: Süper Lig 28203 8 maç + Şampiyonlar Ligi 28155 2 maç); yalnız profil türleri bırakıldı.
// ŞL yanıtında 47 PENALTIES, 83 REDCARDS ve 27256 HALF_RESULTS hiç yok.
const profiles = mapTeamSeasonProfiles(fixture as SportmonksTeamWithStatistics);
const sl = profiles.find((p) => p.seasonId === 28203)!;
const ucl = profiles.find((p) => p.seasonId === 28155)!;
const byKey = (list: ProfileMetric[]) => Object.fromEntries(list.map((m) => [m.key, m]));

describe('mapTeamSeasonProfile (gerçek GS yanıtı)', () => {
  it('Süper Lig: toplamlar ve paydalar', () => {
    expect(sl.played).toBe(8);
    expect(sl.possession).toEqual({ total: 482, games: 8 });
    expect(sl.shots).toEqual({ total: 179, games: 8 });
    expect(sl.shotsOnTarget).toEqual({ total: 61, games: 8 });
    expect(sl.corners).toEqual({ total: 60, games: 8 });
    expect(sl.passes).toEqual({ total: 3840, games: 8 });
    expect(sl.minutes).toEqual({ minutes: 720, goals: 17 });
    expect(sl.failedToScore).toEqual({ all: 1, home: 0, away: 1 });
    // Devre skorlarıyla birebir: Erzurum 3+1, Göztepe 1+2, Kasımpaşa 1+2, Başakşehir 1+2.
    expect(sl.scoredBothHalves).toEqual({ total: 4, games: 8 });
    expect(sl.penalties).toEqual({ scored: 1, missed: 0 });
    expect(sl.yellow).toEqual({ total: 14, games: 8 });
    expect(sl.red).toEqual({ total: 2, games: 8 });
    expect(sl.bestPlayer).toEqual({ playerId: 455805, name: 'Victor Osimhen', rating: 7.72, seasonId: 28203, played: 8 });
  });

  it('gelmeyen tür 0 sayılmaz (ŞL: penaltı, kırmızı kart, iki yarı yok)', () => {
    expect(ucl.played).toBe(2);
    expect(ucl.penalties).toBeNull();
    expect(ucl.red).toBeNull();
    expect(ucl.scoredBothHalves).toBeNull();
    expect(ucl.yellow).toEqual({ total: 5, games: 2 });
  });
});

describe('seasonProfileMetrics', () => {
  it('Süper Lig: 10 metrik, maç başı ortalamalar', () => {
    const m = seasonProfileMetrics(sl);
    expect(m.map((x) => x.key)).toEqual([
      'possession',
      'shots',
      'corners',
      'passes',
      'minutesPerGoal',
      'failedToScore',
      'scoredBothHalves',
      'penalties',
      'yellow',
      'bestPlayer',
    ]);
    const k = byKey(m);
    expect(k.possession).toEqual({ key: 'possession', value: 60 });
    expect(k.shots).toEqual({ key: 'shots', value: 22.4, onTarget: 7.6 });
    expect(k.corners).toEqual({ key: 'corners', value: 7.5 });
    expect(k.passes).toEqual({ key: 'passes', value: 480 });
    expect(k.minutesPerGoal).toEqual({ key: 'minutesPerGoal', value: 42 }); // API'nin SCORING_FREQUENCY'si 42.35
    expect(k.penalties).toEqual({ key: 'penalties', scored: 1, attempts: 1 });
    expect(k.yellow).toEqual({ key: 'yellow', value: 1.8, red: 2 });
  });

  it('Tümü: ortalama yalnız türün geldiği sezonların maçlarına bölünür; oyuncu en çok maçlı turnuvadan', () => {
    const all = combineSeasonProfiles([ucl, sl]);
    expect(all.played).toBe(10);
    expect(all.possession).toEqual({ total: 573, games: 10 });
    expect(all.scoredBothHalves).toEqual({ total: 4, games: 8 });
    expect(all.red).toEqual({ total: 2, games: 8 });
    expect(all.minutes).toEqual({ minutes: 900, goals: 19 });
    expect(all.bestPlayer?.seasonId).toBe(28203);
    const k = byKey(seasonProfileMetrics(all));
    expect(k.possession).toEqual({ key: 'possession', value: 57 });
    expect(k.scoredBothHalves).toEqual({ key: 'scoredBothHalves', value: 4, games: 8 });
    expect(k.minutesPerGoal).toEqual({ key: 'minutesPerGoal', value: 47 });
  });

  it('ŞL: penaltısız, iki yarısız → 8 metrik; kırmızı kart bilinmiyor (null, 0 değil)', () => {
    const k = byKey(seasonProfileMetrics(ucl));
    expect(Object.keys(k)).toHaveLength(8);
    expect(k.penalties).toBeUndefined();
    expect(k.yellow).toEqual({ key: 'yellow', value: 2.5, red: null });
  });

  it('boş / maçsız / tuhaf veri', () => {
    expect(seasonProfileMetrics(null)).toEqual([]);
    const [empty] = mapTeamSeasonProfiles({ id: 1, statistics: [{ season_id: 9, details: [] }] });
    expect(seasonProfileMetrics(empty)).toEqual([]);
    const [odd] = mapTeamSeasonProfiles({
      id: 1,
      statistics: [
        {
          season_id: 9,
          details: [
            { type_id: 27263, value: { total: 3 } },
            { type_id: 52, value: { all: { count: 0 } } },
            { type_id: 27249, value: { total_minutes_played: 270 } },
            { type_id: 211, value: { rating: 7.1, player_id: 5, player_name: '' } },
            { type_id: 47, value: { scored: 0, missed: 0 } },
            { type_id: 45, value: null },
          ],
        },
      ],
    });
    // Golsüz: gol sıklığı yok; adsız oyuncu yok; denemesiz penaltı yok; null değer çökertmez.
    expect(seasonProfileMetrics(odd)).toEqual([]);
  });
});
