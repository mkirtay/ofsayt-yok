import { describe, it, expect } from 'vitest';
import {
  mapSportmonksEvents,
  mapSportmonksStatistics,
  mapSportmonksLineups,
  extractLineupRating,
  extractAppearances,
  mapTopscorerRowsToEntries,
  mapTopscorerRowToEntry,
  mergeDisciplinaryRows,
  extractSquadStats,
  extractTeamTopScorers,
} from './sportmonksKatman2Mapper';
import type { SportmonksFixture, SportmonksLineupRow, SportmonksTopscorerRow } from './sportmonks/types';
import topscorersGoalsAssistsSuperLig from './sportmonks/__fixtures__/topscorersGoalsAssistsSuperLig.json';
import squadStatisticsAppearances from './sportmonks/__fixtures__/squadStatisticsAppearances.json';
import celtaVigoFixture from './sportmonks/__fixtures__/celtaVigoFixture.json';
import celtaVigoLineups from './sportmonks/__fixtures__/celtaVigoLineups.json';
import topscorersGoals from './sportmonks/__fixtures__/topscorersGoals.json';
import topscorersCards from './sportmonks/__fixtures__/topscorersCards.json';
import attemptsOnGoalVerification from './sportmonks/__fixtures__/attemptsOnGoalVerification.json';

describe('mapSportmonksEvents — Faz 3, gerçek fixture 19732740 (Celta de Vigo vs Osasuna)', () => {
  const fixture = celtaVigoFixture as SportmonksFixture;

  it('17 gerçek olayın tamamını eşler', () => {
    const events = mapSportmonksEvents(fixture);
    expect(events).toHaveLength(17);
  });

  it('kırmızı kartı (Marcos Alonso, home) doğru eşler — is_home:true, RED_CARD', () => {
    const events = mapSportmonksEvents(fixture);
    const redCard = events.find((e) => e.event === 'RED_CARD');
    expect(redCard).toMatchObject({
      player: { name: 'Marcos Alonso' },
      time: 51,
      is_home: true,
      is_away: false,
    });
  });

  it('VAR ve VAR_CARD olaylarını (Faz 3\'te yeni bulunan type_id\'ler) doğru etiketler', () => {
    const events = mapSportmonksEvents(fixture);
    expect(events.some((e) => e.event === 'VAR')).toBe(true);
    expect(events.some((e) => e.event === 'VAR_CARD')).toBe(true);
  });

  it('deplasman golünü (Osasuna, Kike Barja) is_away:true olarak eşler', () => {
    const events = mapSportmonksEvents(fixture);
    const awayGoal = events.find((e) => e.event === 'GOAL' && e.player.name.startsWith('Kike Barja'));
    expect(awayGoal).toMatchObject({ is_home: false, is_away: true, time: 54 });
  });
});

describe('mapSportmonksStatistics — aynı fixture, gerçek statistics[]', () => {
  const fixture = celtaVigoFixture as SportmonksFixture;

  it('"H:A" formatında home:away çiftleri üretir', () => {
    const stats = mapSportmonksStatistics(fixture.statistics);
    expect(stats).toMatchObject({
      corners: '5:3', // home:away (type_id 34)
      possesion: '52:48',
      fauls: '7:16',
      shots_on_target: '2:5',
    });
  });

  it('Faz 3\'te çözülen red_cards (type_id 83) artık dolduruluyor — Pass 5\'in açık bıraktığı alan', () => {
    const stats = mapSportmonksStatistics(fixture.statistics);
    expect(stats?.red_cards).toBe('1:0'); // Celta de Vigo (home) 1 kırmızı, Osasuna (away) 0
  });

  it('fixture\'da hiç statistics yoksa null döner', () => {
    expect(mapSportmonksStatistics(undefined)).toBeNull();
    expect(mapSportmonksStatistics([])).toBeNull();
  });

  it('Faz 4 madde 1: attempts_on_goal → type_id 42, İKİ BAĞIMSIZ gerçek maçla kesinleştirildi', () => {
    // 2026-09-18: fixture 19746621 (Süper Lig, Fenerbahçe-Beşiktaş) ve fixture
    // 19732740 (La Liga, Celta de Vigo-Osasuna) — her iki maçın her iki takım
    // satırında type_id:42 ("Shots Total") tam olarak 41(off)+58(blocked)+86(on)
    // toplamına VE 49(insidebox)+50(outsidebox) toplamına eşit çıktı (4/4
    // satırda sıfır sapma). type_id:54 ("Goal Attempts") bu toplamla hiçbir
    // satırda örtüşmedi — attempts_on_goal için KULLANILMADI.
    const matches = attemptsOnGoalVerification as Record<
      string,
      { statistics: Array<{ type_id: number; participant_id: number; location: 'home' | 'away'; data: { value: number } }> }
    >;
    for (const match of Object.values(matches)) {
      const byTeam = new Map<number, Record<number, number>>();
      for (const row of match.statistics) {
        const entry = byTeam.get(row.participant_id) ?? {};
        entry[row.type_id] = row.data.value;
        byTeam.set(row.participant_id, entry);
      }
      for (const vals of byTeam.values()) {
        const total = vals[42];
        expect(vals[41] + vals[58] + vals[86]).toBe(total); // off + blocked + on = total
        expect(vals[49] + vals[50]).toBe(total); // insidebox + outsidebox = total
        expect(vals[54]).not.toBe(total); // "Goal Attempts" ayrı/örtüşmeyen bir istatistik
      }

      // mapSportmonksStatistics'in attempts_on_goal alanı gerçekten type_id:42'yi
      // kullanıyor (34 gibi eşlenmemiş bir type_id değil) — "H:A" çıktısı, aynı
      // maçın home/away'e göre gruplanmış type_id:42 değerleriyle birebir aynı.
      const home = match.statistics.find((s) => s.type_id === 42 && s.location === 'home')!.data.value;
      const away = match.statistics.find((s) => s.type_id === 42 && s.location === 'away')!.data.value;
      const mapped = mapSportmonksStatistics(match.statistics as never);
      expect(mapped?.attempts_on_goal).toBe(`${home}:${away}`);
    }
  });

  it('bir taraf için satır hiç gelmemişse (Pass 5: "sıfır değerli satırlar bazen hiç gelmiyor") 0\'a düşer', () => {
    // Pass 5'in kendi notu: statistics[] yalnızca gerçekleşen olaylar için satır
    // üretiyor, bir takımda o istatistik hiç oluşmadıysa satırın kendisi hiç
    // gelmeyebiliyor (0 değerli bir satır değil, satırın YOKLUĞU).
    const onlyHomeCorner = [
      { id: 1, fixture_id: 1, type_id: 34, participant_id: 36, location: 'home' as const, data: { value: 5 } },
    ];
    const stats = mapSportmonksStatistics(onlyHomeCorner);
    expect(stats?.corners).toBe('5:0');
  });
});

describe('mapSportmonksLineups — aynı fixture, gerçek lineups[] (include=lineups.player)', () => {
  const fixture: SportmonksFixture = {
    ...(celtaVigoFixture as SportmonksFixture),
    lineups: celtaVigoLineups as SportmonksLineupRow[],
  };

  it('home/away takımlarını participants[].meta.location üzerinden doğru ayırır', () => {
    const data = mapSportmonksLineups(fixture);
    expect(data?.lineup.home.team.name).toBe('Celta de Vigo');
    expect(data?.lineup.away.team.name).toBe('Osasuna');
  });

  it('starter (type_id 11) → substitution "0", bench (type_id 12) → "1"', () => {
    const data = mapSportmonksLineups(fixture);
    const marcosAlonso = data?.lineup.home.players.find((p) => p.name === 'Marcos Alonso');
    const altay = data?.lineup.home.players.find((p) => p.id === '438751');
    expect(marcosAlonso?.substitution).toBe('0');
    expect(altay?.substitution).toBe('1');
  });

  it('position_id → GK/DF/MF/FW kısaltmasına çevrilir, fotoğraf (include=lineups.player) aktarılır', () => {
    const data = mapSportmonksLineups(fixture);
    const gk = data?.lineup.home.players.find((p) => p.name?.includes('Ionuț'));
    expect(gk?.position).toBe('GK');
    expect(gk?.photo).toContain('130199.png');
  });

  it('lineups hiç yoksa null döner', () => {
    expect(mapSportmonksLineups(celtaVigoFixture as SportmonksFixture)).toBeNull();
  });
});

describe('mapSportmonksLineups — oyuncu reytingi (include=lineups.details, type_id 118)', () => {
  const baseRows = celtaVigoLineups as SportmonksLineupRow[];
  const withDetails = (details: SportmonksLineupRow['details']): SportmonksFixture => ({
    ...(celtaVigoFixture as SportmonksFixture),
    lineups: baseRows.map((r, i) => (i === 0 ? { ...r, details } : r)),
  });
  const firstPlayer = (f: SportmonksFixture) => {
    const d = mapSportmonksLineups(f)!;
    return [...d.lineup.home.players, ...d.lineup.away.players].find((p) => p.id === String(baseRows[0].player_id))!;
  };

  it('details içindeki type_id 118 değerini rating olarak aktarır, diğer ~50 alanı atar', () => {
    const p = firstPlayer(
      withDetails([
        { type_id: 119, data: { value: 90 } },
        { type_id: 118, data: { value: 7.68 } },
        { type_id: 80, data: { value: 41 } },
      ]),
    );
    expect(p.rating).toBe(7.68);
    expect(p).not.toHaveProperty('details');
  });

  it('details yoksa / boşsa / 118 yoksa rating alanı HİÇ set edilmez (oynamayan yedek)', () => {
    expect(firstPlayer(withDetails(undefined))).not.toHaveProperty('rating');
    expect(firstPlayer(withDetails([]))).not.toHaveProperty('rating');
    expect(firstPlayer(withDetails([{ type_id: 119, data: { value: 90 } }]))).not.toHaveProperty('rating');
  });

  it('sayı olmayan veya ≤0 değer rating sayılmaz (UI asla "0" görmesin)', () => {
    expect(extractLineupRating([{ type_id: 118, data: { value: 0 } }])).toBeUndefined();
    expect(extractLineupRating([{ type_id: 118, data: { value: 'n/a' } }])).toBeUndefined();
    expect(extractLineupRating([{ type_id: 118, data: { value: -1 } }])).toBeUndefined();
    expect(extractLineupRating([{ type_id: 118, data: { value: '6.5' } }])).toBe(6.5);
  });
});

describe('mapTopscorerRowToEntry — gerçek goller (Raphinha, 9 gol)', () => {
  it('goals/team/player alanlarını doğru eşler', () => {
    const [raphinha] = topscorersGoals as SportmonksTopscorerRow[];
    const entry = mapTopscorerRowToEntry(raphinha);
    expect(entry).toMatchObject({
      goals: 9,
      team: { id: 83, name: 'FC Barcelona' },
      player: { id: 160258, name: 'Raphinha' },
    });
  });
});

describe('mergeDisciplinaryRows — gerçek kombine filters=seasonTopscorerTypes:83,84 örneği', () => {
  const rows = topscorersCards as SportmonksTopscorerRow[];

  it('aynı oyuncunun (Mario Martín) sarı+kırmızı satırlarını tek satırda birleştirir', () => {
    const merged = mergeDisciplinaryRows(rows);
    const marioMartin = merged.find((r) => r.player.name === 'Mario Martín');
    expect(marioMartin).toMatchObject({
      player: { id: 37601802, name: 'Mario Martín' },
      team: { id: 106, name: 'Getafe' },
      yellow_cards: 3,
      red_cards: 1,
    });
  });

  it('yalnızca kırmızısı olan bir oyuncuda yellow_cards 0 kalır', () => {
    const merged = mergeDisciplinaryRows(rows);
    const marcosAlonso = merged.find((r) => r.player.name === 'Marcos Alonso');
    expect(marcosAlonso).toMatchObject({ yellow_cards: 0, red_cards: 1 });
  });

  it('birleştirilmiş satır sayısı, benzersiz oyuncu sayısına eşit', () => {
    const merged = mergeDisciplinaryRows(rows);
    const uniquePlayers = new Set(rows.map((r) => r.player_id));
    expect(merged).toHaveLength(uniquePlayers.size);
  });
});

describe('Gol Krallığı O/A — gerçek Süper Lig 28203 verisi', () => {
  it('extractAppearances: type 321 value.total → player_id haritası; kaydı olmayan oyuncu haritada YOK (undefined → "—")', () => {
    const out = extractAppearances(squadStatisticsAppearances as never, 28203);
    expect(out[25515]).toBe(2);
    expect(out[167842]).toBe(3);
    expect(out[37728187]).toBeUndefined();
    expect(Object.values(out).every((n) => n > 0)).toBe(true); // asla 0
  });

  it('extractAppearances: başka sezonun istatistiği sayılmaz', () => {
    expect(extractAppearances(squadStatisticsAppearances as never, 11111)).toEqual({});
  });

  it('extractAppearances: total 0 / sayı olmayan değer atlanır', () => {
    const rows = [
      { player_id: 1, player: { id: 1, statistics: [{ season_id: 5, details: [{ type_id: 321, value: { total: 0 } }] }] } },
      { player_id: 2, player: { id: 2, statistics: [{ season_id: 5, details: [{ type_id: 321, value: { total: 'x' } }] }] } },
      { player_id: 3, player: { id: 3, statistics: [{ season_id: 5, details: [{ type_id: 321, value: { total: 4 } }] }] } },
    ];
    expect(extractAppearances(rows as never, 5)).toEqual({ 3: 4 });
  });

  it('mapTopscorerRowsToEntries: yalnızca asisti olan oyuncu listeye girmez; goal-only oyuncuda assists yok', () => {
    const rows = topscorersGoalsAssistsSuperLig as never;
    const entries = mapTopscorerRowsToEntries(rows);
    const goalPlayers = new Set((rows as Array<{ type_id: number; player_id: number }>).filter((r) => r.type_id === 208).map((r) => r.player_id));
    expect(entries.map((e) => e.player!.id).sort()).toEqual([...goalPlayers].sort());
  });
});

describe('extractSquadStats', () => {
  const row = (player_id: number, details: { type_id: number; value: unknown }[], extra: Record<string, unknown> = {}, statTeam = 34) =>
    ({
      player_id,
      player: { id: player_id, detailed_position_id: 156, statistics: [{ season_id: 28203, team_id: statTeam, details }], ...extra },
    }) as never;

  it('M>0 iken eksik G/A/SK/KK 0 olur; kart type_id 84 sarı, 83 kırmızı', () => {
    const out = extractSquadStats(
      [row(1, [{ type_id: 321, value: { total: 4 } }, { type_id: 52, value: { total: 2, goals: 2 } }, { type_id: 84, value: { total: 1 } }])],
      28203,
      34,
    );
    expect(out[1]).toEqual({ detailedPositionId: 156, appearances: 4, goals: 2, assists: 0, yellow: 1, red: 0 });
  });

  it('M yoksa sayılar yazılmaz (UI "—"); yalnızca pozisyon kalır', () => {
    expect(extractSquadStats([row(2, [])], 28203, 34)[2]).toEqual({ detailedPositionId: 156 });
  });

  it('aynı sezonda başka takımın satırı alınmaz (transfer)', () => {
    const out = extractSquadStats([row(3, [{ type_id: 321, value: { total: 9 } }], {}, 99)], 28203, 34);
    expect(out[3]).toEqual({ detailedPositionId: 156 });
  });
});

describe('extractTeamTopScorers', () => {
  const mk = (id: number, name: string, goals: number, apps: number) =>
    ({
      player_id: id,
      player: {
        id,
        display_name: name,
        image_path: `https://x/${id}.png`,
        statistics: [{ season_id: 1, team_id: 34, details: [{ type_id: 321, value: { total: apps } }, ...(goals ? [{ type_id: 52, value: { total: goals } }] : [])] }],
      },
    }) as never;

  it('ilk 3: çok gol önce, eşitlikte daha az maç; golsüz oyuncu yok', () => {
    const rows = [mk(1, 'A', 3, 5), mk(2, 'B', 6, 4), mk(3, 'C', 6, 3), mk(4, 'D', 1, 2), mk(5, 'E', 0, 9)];
    const out = extractTeamTopScorers(rows, 1, 34);
    expect(out.map((p) => p.name)).toEqual(['C', 'B', 'A']);
    expect(out[0]).toEqual({ playerId: 3, name: 'C', photo: 'https://x/3.png', goals: 6 });
  });
  it('3\'ten az golcü → yalnızca var olanlar; hiç yoksa boş', () => {
    expect(extractTeamTopScorers([mk(1, 'A', 2, 5), mk(2, 'B', 0, 4)], 1, 34)).toHaveLength(1);
    expect(extractTeamTopScorers([mk(2, 'B', 0, 4)], 1, 34)).toEqual([]);
  });
});

describe('mapSportmonksLineups — bayrak + kısa mevki kodu', () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 1,
      fixture_id: 9,
      player_id: 7,
      team_id: 34,
      position_id: 26,
      type_id: 11,
      formation_field: '4:2',
      jersey_number: 8,
      details: [],
      player: { id: 7, display_name: 'X', detailed_position_id: 150, nationality: { name: 'Turkey', image_path: 'https://cdn/tr.png' } },
      ...over,
    }) as never;
  const fx = (lineups: unknown[]) =>
    ({ id: 9, participants: [{ id: 34, name: 'GS', meta: { location: 'home' } }, { id: 1, name: 'B', meta: { location: 'away' } }], lineups }) as never;

  it('ayrıntılı id → CAM, bayrak PNG + ülke adı', () => {
    const p = mapSportmonksLineups(fx([row()]))!.lineup.home.players[0];
    expect(p.pos_code).toBe('CAM');
    expect(p.nationality).toEqual({ name: 'Turkey', flag: 'https://cdn/tr.png' });
  });
  it('ayrıntılı id yok → kaba kod; uyruk yok → bayrak alanı yok', () => {
    const p = mapSportmonksLineups(fx([row({ player: { id: 7, display_name: 'X' } })]))!.lineup.home.players[0];
    expect(p.pos_code).toBe('MF');
    expect(p.nationality).toBeUndefined();
  });
});
