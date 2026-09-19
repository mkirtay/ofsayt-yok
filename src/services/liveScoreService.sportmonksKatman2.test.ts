import { describe, it, expect, vi, afterEach } from 'vitest';
import celtaVigoFixture from './sportmonks/__fixtures__/celtaVigoFixture.json';
import celtaVigoLineups from './sportmonks/__fixtures__/celtaVigoLineups.json';
import standingsLaLiga from './sportmonks/__fixtures__/standingsLaLiga.json';
import standingsGroupedEuropaLeague from './sportmonks/__fixtures__/standingsGroupedEuropaLeague.json';
import topscorersGoals from './sportmonks/__fixtures__/topscorersGoals.json';
import topscorersCards from './sportmonks/__fixtures__/topscorersCards.json';
import topscorersGoalsAssistsSuperLig from './sportmonks/__fixtures__/topscorersGoalsAssistsSuperLig.json';
import squadStatisticsAppearances from './sportmonks/__fixtures__/squadStatisticsAppearances.json';
import squadBarcelona from './sportmonks/__fixtures__/squadBarcelona.json';
import squadBarcelonaHistoric from './sportmonks/__fixtures__/squadBarcelonaHistoric.json';
import seasonsLaLiga from './sportmonks/__fixtures__/seasonsLaLiga.json';
import headToHeadBarcaMadrid from './sportmonks/__fixtures__/headToHeadBarcaMadrid.json';
import teamLastMatchesRealMadrid from './sportmonks/__fixtures__/teamLastMatchesRealMadrid.json';

/**
 * Faz 3 (Katman-2/3) — `liveScoreService.ts`'teki maç detay/H2H/sıralama/kadro
 * fonksiyonlarının `NEXT_PUBLIC_SPORTMONKS_ENABLED` bayrağına göre doğru
 * Sportmonks endpoint'ine gittiğini ve gerçek fixture verisini doğru şekle
 * çevirdiğini doğrular. Gerçek ağ isteği YOK — `global.fetch` mock'lanıyor.
 */

const ORIGINAL_ENABLED = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;

function restoreEnv() {
  if (ORIGINAL_ENABLED === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL_ENABLED;
  if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
  else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
}

function envelope(data: unknown): () => Promise<Response> {
  return async () =>
    new Response(
      JSON.stringify({
        data,
        rate_limit: { resets_in_seconds: 2678, remaining: 2400, requested_entity: 'Fixture' },
      }),
      { status: 200 },
    );
}

/** Aynı URL parçasına göre farklı mock cevap dönen bir router — birden fazla ardışık isteği ayırt etmek için. */
function routedFetch(routes: Array<{ match: string; data: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`mock rota bulunamadı: ${url}`);
    return new Response(
      JSON.stringify({ data: route.data, rate_limit: { resets_in_seconds: 2678, remaining: 2400, requested_entity: 'Fixture' } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

async function withSportmonksEnabled<T>(fn: () => Promise<T>): Promise<T> {
  process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
  process.env.SPORTMONKS_API_KEY = 'test-token';
  vi.resetModules();
  try {
    return await fn();
  } finally {
    restoreEnv();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe('getTeamHistoryMatches / getTeamLastMatches — Faz 3, /fixtures/between/{start}/{end}/{team_id}', () => {
  it('doğru parametre sırasıyla (team_id EN SONDA) çağırır ve en-yeni-önce sıralar', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope(teamLastMatchesRealMadrid));
      const { getTeamHistoryMatches, getTeamLastMatches } = await import('./liveScoreService');

      const matches = await getTeamHistoryMatches('3468');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      // .../fixtures/between/{from}/{to}/3468 — team_id path'in SONUNDA
      expect(calledUrl).toMatch(/\/fixtures\/between\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\/3468(\?|$)/);

      // Upstream artan tarihle döndü (2026-08-22 → 2026-09-15) — en yeni önce olmalı
      expect(matches[0].date).toBe('2026-09-15');
      expect(matches[matches.length - 1].date).toBe('2026-08-22');

      const last3 = await getTeamLastMatches('3468', 3);
      expect(last3).toHaveLength(3);
      expect(last3[0].date).toBe('2026-09-15');
    });
  });
});

describe('getTeamsHead2Head — Faz 3, /fixtures/head-to-head/{id1}/{id2}', () => {
  it('gerçek FC Barcelona - Real Madrid H2H listesini eşler ve form dizilerini türetir', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/fixtures/head-to-head/', data: headToHeadBarcaMadrid },
          { match: '/fixtures/between/', data: [] }, // overall_form için (team last matches) — boş, sadece h2h_form test edilsin
        ]),
      );
      const { getTeamsHead2Head } = await import('./liveScoreService');

      const result = await getTeamsHead2Head('83', '3468');

      expect(fetchSpy).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.h2h).toHaveLength(4);
      expect(result?.team1.id).toBe('83');
      expect(result?.team2.id).toBe('3468');
      // h2hMatches İÇİNDE takım adı bulunabilmeli (Sportmonks bu endpoint'te team1/team2 özeti vermiyor — client-side türetildi)
      expect(result?.team1.name).toBe('FC Barcelona');
      expect(result?.team2.name).toBe('Real Madrid');
      // Faz 4 madde 4 (kontrat testi envanteri): deriveMatchFormLetter daha önce
      // sadece "uzunluk > 0" diye gevşek test edilmişti — gerçek 4 skordan
      // (2-0, 2-1, 4-3, 3-2; FC Barcelona sırasıyla ev/dep/ev/ev) W/D/L tam
      // olarak elle hesaplanıp doğrulandı (en yeni önce, H2H endpoint'i zaten
      // bu sırada döndü):
      expect(result?.team1.h2h_form).toEqual(['W', 'L', 'W', 'W']); // FC Barcelona
      expect(result?.team2.h2h_form).toEqual(['L', 'W', 'L', 'L']); // Real Madrid (aynı maçların tersi)
    });
  });

  it('h2h sonucu boşsa null döner', async () => {
    await withSportmonksEnabled(async () => {
      vi.spyOn(global, 'fetch').mockImplementation(envelope([]));
      const { getTeamsHead2Head } = await import('./liveScoreService');
      const result = await getTeamsHead2Head('1', '2');
      expect(result).toBeNull();
    });
  });
});

describe('getMatchWithEvents / getMatchStats / getMatchLineups — Faz 3, gerçek fixture 19732740', () => {
  it('getMatchWithEvents: /fixtures/{id}?include=...events çağırır, 17 olayı eşler', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope(celtaVigoFixture));
      const { getMatchWithEvents } = await import('./liveScoreService');

      const { match, events } = await getMatchWithEvents('19732740');

      expect(fetchSpy.mock.calls[0][0] as string).toContain('/fixtures/19732740');
      expect(match?.id).toBe(19732740);
      expect(events).toHaveLength(17);
      expect(events.some((e) => e.event === 'RED_CARD')).toBe(true);
    });
  });

  it('getMatchStats: statistics[]\'i H:A formatında eşler (red_cards dahil)', async () => {
    await withSportmonksEnabled(async () => {
      vi.spyOn(global, 'fetch').mockImplementation(envelope(celtaVigoFixture));
      const { getMatchStats } = await import('./liveScoreService');

      const stats = await getMatchStats('19732740');
      expect(stats?.corners).toBe('5:3');
      expect(stats?.red_cards).toBe('1:0');
    });
  });

  it('getMatchLineups: lineups[]\'i home/away + starter/bench olarak eşler', async () => {
    await withSportmonksEnabled(async () => {
      const fixtureWithLineups = { ...celtaVigoFixture, lineups: celtaVigoLineups };
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope(fixtureWithLineups));
      const { getMatchLineups } = await import('./liveScoreService');

      const lineups = await getMatchLineups('19732740');
      // Oyuncu reytingi için lineups.details include'u şart (type_id 118).
      const url = decodeURIComponent(fetchSpy.mock.calls[0][0] as string);
      expect(url).toContain('include=lineups.player.nationality;lineups.details;participants');
      expect(lineups.lineup.home.team.name).toBe('Celta de Vigo');
      expect(lineups.lineup.away.team.name).toBe('Osasuna');
      expect(lineups.lineup.home.players.some((p: { substitution: string }) => p.substitution === '0')).toBe(true);
    });
  });
});

describe('getTeamSquads — Faz 3, /squads/teams/{id} (güncel) ve /squads/seasons/{id}/teams/{id} (geçmiş)', () => {
  it('season verilmezse güncel kadro endpoint\'ini çağırır ve id/shirt_number/name döner', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope(squadBarcelona));
      const { getTeamSquads } = await import('./liveScoreService');

      const squad = await getTeamSquads('83', '3');
      expect(fetchSpy.mock.calls[0][0] as string).toContain('/squads/teams/83');
      expect(squad[0]).toMatchObject({ id: 37598766, shirt_number: 19, name: 'Roony Bardghji' });
    });
  });

  it('seasonId verilirse geçmiş kadro endpoint\'ine (squads/seasons/{id}/teams/{id}) gider', async () => {
    await withSportmonksEnabled(async () => {
      // Faz 4 madde 4: daha önce bu test güncel kadro fixture'ını (squadBarcelona)
      // yeniden kullanıyordu — geçmiş kadro endpoint'inin GERÇEKTEN aynı şekli mi
      // döndürdüğü hiç ayrıca doğrulanmamıştı. Taze istekle bulundu: response şekli
      // BENZER ama AYNI DEĞİL — `captain`/`start`/`end` yok (`has_values` var, biz
      // kullanmıyoruz), ve rate_limit havuzu farklı (`PlayerStatistic`, 7. bağımsız
      // havuz — `PlayerTeam` değil). `SportmonksSquadRow`'daki opsiyonel alanlar
      // sayesinde mapper hâlâ doğru çalışıyor, bu artık gerçek veriyle kanıtlı.
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope(squadBarcelonaHistoric));
      const { getTeamSquads } = await import('./liveScoreService');

      const squad = await getTeamSquads('83', '3', { seasonId: 25659 });
      expect(fetchSpy.mock.calls[0][0] as string).toContain('/squads/seasons/25659/teams/83');
      expect(squad[0]).toMatchObject({ id: 37696525, shirt_number: 41, name: 'Juan Hernández', captain: false });
    });
  });
});

describe('getSeasonsList — Faz 3, lig-scoped /leagues/{id}?include=seasons', () => {
  it('competitionId verilirse doğru lige gider ve is_current sezonu içerir', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope({ id: 564, seasons: seasonsLaLiga }));
      const { getSeasonsList } = await import('./liveScoreService');

      const seasons = await getSeasonsList({ competitionId: 3, skipCalendarYearDedupe: true }); // 3 = İspanya La Liga
      expect(fetchSpy.mock.calls[0][0] as string).toContain('/leagues/564');
      expect(seasons.some((s) => s.id === 27965 && s.name === '2026/2027')).toBe(true);
    });
  });

  it('competitionId verilmezse (global liste artık yok) ağ isteği atmadan boş dizi döner', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope({}));
      const { getSeasonsList } = await import('./liveScoreService');

      const seasons = await getSeasonsList();
      expect(seasons).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe('getCompetitionTableFull / getLeagueTable — Faz 3, /standings/seasons/{id}, details[] pivotu', () => {
  it('season verilmezse önce is_current sezonu çözer, sonra standings çeker', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/564', data: { id: 564, seasons: seasonsLaLiga } },
          { match: '/standings/seasons/27965', data: standingsLaLiga },
        ]),
      );
      const { getCompetitionTableFull } = await import('./liveScoreService');

      const result = await getCompetitionTableFull('3'); // 3 = La Liga
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result?.season?.id).toBe(27965);
      expect(result?.table?.[0]).toMatchObject({ rank: 1, name: 'FC Barcelona', points: 18, matches: 6 });
    });
  });

  it('getLeagueTable aynı veriyi düz dizi olarak döner', async () => {
    await withSportmonksEnabled(async () => {
      vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/564', data: { id: 564, seasons: seasonsLaLiga } },
          { match: '/standings/seasons/27965', data: standingsLaLiga },
        ]),
      );
      const { getLeagueTable } = await import('./liveScoreService');

      const table = await getLeagueTable('3');
      expect(Array.isArray(table)).toBe(true);
      expect(table[0]).toMatchObject({ rank: 1, name: 'FC Barcelona' });
    });
  });

  it('Faz 4 madde 4: group_id verilirse yalnızca o gruba ait satırları döner (2022/23 Avrupa Ligi grup aşaması)', async () => {
    // sportmonksFetchStandingsTable'ın group_id client-side filtresi daha önce
    // hiç test edilmemişti — mevcut fixture'ların hepsi group_id:null idi.
    // Gerçek grup aşamalı bir sezonla (season_id 20090, 8 grup × 4 takım) kapatıldı.
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([{ match: '/standings/seasons/20090', data: standingsGroupedEuropaLeague }]),
      );
      const { getCompetitionTableFull } = await import('./liveScoreService');

      const result = await getCompetitionTableFull('245', { season: 20090, group_id: 247770 }); // 245 = UEFA Avrupa Ligi
      expect(fetchSpy).toHaveBeenCalledTimes(1); // season verildi, /leagues/{id} çağrısı gerekmedi
      expect(result?.table).toHaveLength(2);
      expect(result?.table?.every((row) => ['Arsenal', 'PSV'].includes(row.name ?? ''))).toBe(true);
      expect(result?.table?.some((row) => row.name === 'Real Betis')).toBe(false);
    });
  });

  it('eşlemesi olmayan bir competitionId için ağ isteği atmadan null döner', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope({}));
      const { getCompetitionTableFull } = await import('./liveScoreService');
      const result = await getCompetitionTableFull('362'); // World Cup — eşlemesiz
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe('getTopScorers / getTopDisciplinary — Faz 3, tek primitif (sportmonksFetchTopscorerRows) paylaşımı', () => {
  it('getTopScorers: filters=seasonTopscorerTypes:208 ile gol listesini eşler', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/564', data: { id: 564, seasons: seasonsLaLiga } },
          { match: '/topscorers/seasons/27965', data: topscorersGoals },
        ]),
      );
      const { getTopScorers } = await import('./liveScoreService');

      const result = await getTopScorers('3');
      const calledUrl = fetchSpy.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/topscorers/'));
      expect(calledUrl).toContain('seasonTopscorerTypes%3A208%2C209'); // gol + asist tek sorguda
      expect(result?.topscorers?.[0]).toMatchObject({ goals: 9, player: { name: 'Raphinha' } });
    });
  });

  it('getTopScorers (gerçek Süper Lig 28203): asistler 209\'dan player_id ile eklenir; asist listesinde olmayan oyuncuda assists undefined', async () => {
    await withSportmonksEnabled(async () => {
      vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/600', data: { id: 600, seasons: [{ id: 28203, name: '2026/2027', is_current: true }] } },
          { match: '/topscorers/seasons/28203', data: topscorersGoalsAssistsSuperLig },
        ]),
      );
      const { getTopScorers } = await import('./liveScoreService');

      const result = await getTopScorers('6');
      expect(result?.season?.id).toBe(28203);
      const list = result!.topscorers!;
      // Liste gol sıralaması: yalnızca 208 satırları (209 satırları ayrı oyuncu girişi OLMAZ)
      expect(list).toHaveLength(10);
      const raw = topscorersGoalsAssistsSuperLig as Array<{ type_id: number; player_id: number; total: number }>;
      const assistByPlayer = new Map(raw.filter((r) => r.type_id === 209).map((r) => [r.player_id, r.total]));
      expect(assistByPlayer.size).toBe(4);
      for (const entry of list) {
        const a = assistByPlayer.get(entry.player!.id!);
        if (a !== undefined) expect(entry.assists).toBe(a);
        else expect(entry.assists).toBeUndefined(); // "—" (asla 0)
      }
      expect(list.some((e) => e.assists !== undefined)).toBe(true);
      expect(list.some((e) => e.assists === undefined)).toBe(true);
    });
  });

  it('getTopScorerAppearances: takım başına 1 istek, squads/seasons/{sid}/teams/{tid}?include=player.statistics.details + playerStatisticSeasons filtresi', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope(squadStatisticsAppearances));
      const { getTopScorerAppearances } = await import('./liveScoreService');

      const out = await getTopScorerAppearances(28203, [4192, 4192, 999]); // tekrar eden takım tek istek
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const urls = fetchSpy.mock.calls.map((c) => decodeURIComponent(String(c[0])));
      expect(urls[0]).toContain('/squads/seasons/28203/teams/4192');
      expect(urls[0]).toContain('include=player.statistics.details');
      expect(urls[0]).toContain('filters=playerStatisticSeasons:28203');
      expect(out[25515]).toBe(2); // Juninho Bacuna — gerçek veri: 2 maç
      expect(out[37728187]).toBeUndefined(); // M. Müjdeci — appearances kaydı yok → "—"
    });
  });

  it('getTopScorerAppearances: bir takım isteği başarısız olursa çökmez, diğer takımların verisi korunur', async () => {
    await withSportmonksEnabled(async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        if (String(input).includes('/teams/13')) return new Response(JSON.stringify({ message: 'boom' }), { status: 500 });
        return new Response(JSON.stringify({ data: squadStatisticsAppearances, rate_limit: { resets_in_seconds: 1, remaining: 1, requested_entity: 'PlayerStatistic' } }), { status: 200 });
      });
      const { getTopScorerAppearances } = await import('./liveScoreService');
      const out = await getTopScorerAppearances(28203, [4192, 13]);
      expect(out[25515]).toBe(2);
    });
  });

  it('getTopDisciplinary: filters=seasonTopscorerTypes:83,84 ile birleştirilmiş kart listesini döner', async () => {
    await withSportmonksEnabled(async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/564', data: { id: 564, seasons: seasonsLaLiga } },
          { match: '/topscorers/seasons/27965', data: topscorersCards },
        ]),
      );
      const { getTopDisciplinary } = await import('./liveScoreService');

      const result = await getTopDisciplinary('3');
      const calledUrl = fetchSpy.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/topscorers/'));
      expect(calledUrl).toContain('seasonTopscorerTypes%3A83%2C84');
      const marioMartin = result.find((r: { player: { name: string } }) => r.player.name === 'Mario Martín');
      expect(marioMartin).toMatchObject({ yellow_cards: 3, red_cards: 1 });
    });
  });

  it('getTopScorers: filters sessizce uygulanmazsa (Pass 5 risk kategorisi) null döner', async () => {
    // Faz 4 madde 5: getTopScorers/getTopDisciplinary'nin paylaştığı
    // sportmonksFetchTopscorerRows için daha önce hiç silent-filter testi
    // yoktu — beklenmeyen bir type_id (208=gol yerine 999) karışırsa
    // checkFilteredResult bunu yakalamalı.
    await withSportmonksEnabled(async () => {
      const contaminated = [{ ...topscorersGoals[0], type_id: 999 }];
      vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/564', data: { id: 564, seasons: seasonsLaLiga } },
          { match: '/topscorers/seasons/27965', data: contaminated },
        ]),
      );
      const { getTopScorers } = await import('./liveScoreService');

      const result = await getTopScorers('3');
      expect(result).toBeNull();
    });
  });

  it('getTopDisciplinary: filters sessizce uygulanmazsa boş dizi döner', async () => {
    await withSportmonksEnabled(async () => {
      const contaminated = [{ ...topscorersCards[0], type_id: 208 }]; // 83/84 yerine gol type_id'si sızdı
      vi.spyOn(global, 'fetch').mockImplementation(
        routedFetch([
          { match: '/leagues/564', data: { id: 564, seasons: seasonsLaLiga } },
          { match: '/topscorers/seasons/27965', data: contaminated },
        ]),
      );
      const { getTopDisciplinary } = await import('./liveScoreService');

      const result = await getTopDisciplinary('3');
      expect(result).toEqual([]);
    });
  });
});

describe('getCompetitionGroups — Faz 3 madde 1: ölü kod kaldırıldı', () => {
  it('artık dışa aktarılmıyor', async () => {
    const mod = await import('./liveScoreService');
    expect((mod as Record<string, unknown>).getCompetitionGroups).toBeUndefined();
  });
});

describe('Faz 3 fonksiyonları — flag KAPALIYKEN Sportmonks fetch hiç çağrılmaz', () => {
  it('legacy kod yolu korunuyor', async () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'false';
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(envelope({}));
    const { getTeamHistoryMatches, getMatchStats, getSeasonsList } = await import('./liveScoreService');

    await getTeamHistoryMatches('83').catch(() => {});
    await getMatchStats('1').catch(() => {});
    await getSeasonsList().catch(() => {});

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
