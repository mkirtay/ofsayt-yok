import { describe, expect, it } from 'vitest';
import profileFixture from './sportmonks/__fixtures__/playerProfileOsimhen.json';
import fixtureMatch from './sportmonks/__fixtures__/fixturePlayerMatchOsimhen.json';
import { isCupCompetition, mapFixtureToPlayerMatchRow, mapPlayerProfile, pickDefaultSeason, sortSeasonRows, type RawPlayer } from './playerProfile';
import { formatStat, statMain, STAT, PLAYER_STAT_GROUPS } from './sportmonks/playerStatTypes';

const raw = (profileFixture as unknown as { data: RawPlayer }).data;
const profile = mapPlayerProfile(raw);

describe('mapPlayerProfile — gerçek Osimhen (455805) yanıtı', () => {
  it('bio alanları', () => {
    expect(profile).toMatchObject({
      id: 455805,
      name: 'Victor Osimhen',
      dateOfBirth: '1998-12-29',
      heightCm: 186,
      weightKg: 78,
      birthCity: 'Lagos',
      position: 'Attacker',
      detailedPosition: 'Centre Forward',
      preferredFoot: 'right',
      nationality: { name: 'Nigeria' },
    });
    expect(profile.photo).toContain('cdn.sportmonks.com');
    expect(profile.nationality?.flag).toContain('ng.png');
  });

  it('güncel takım: sözleşmesi süren kayıt (Galatasaray)', () => {
    expect(profile.currentTeam).toMatchObject({ id: 34, name: 'Galatasaray' });
  });

  it('sezonlar: verisi olan (details>0) satırlar, en yeni önce; verisiz Şampiyonlar Ligi satırı (28155) elenir', () => {
    expect(profile.seasons.map((s) => s.seasonId)).toEqual([28203, 25682]);
    expect(profile.seasons[0]).toMatchObject({ seasonName: '2026/2027', leagueName: 'Super Lig', teamName: 'Galatasaray' });
  });

  it('sezon istatistikleri: 321 maç, 322 ilk 11, 52 gol, 79 asist, 119 dakika, 118 rating (aynı type_id sözlüğü)', () => {
    const s = profile.seasons[0].stats;
    expect(statMain(s[STAT.APPEARANCES])).toBe(4);
    expect(statMain(s[STAT.LINEUPS])).toBe(4);
    expect(statMain(s[STAT.GOALS])).toBe(6);
    expect(statMain(s[STAT.ASSISTS])).toBe(2);
    expect(statMain(s[STAT.MINUTES])).toBe(303);
    expect(formatStat(s[STAT.RATING], 'rating')).toBe('8.02');
  });

  it('transferler: tarihe göre yeni→eski; kalıcı transferde bedel, kiralıkta null ("—"); takım adı+logo', () => {
    const t = profile.transfers;
    expect(t).toHaveLength(8);
    expect(t.map((x) => x.date)).toEqual([...t.map((x) => x.date)].sort().reverse());
    const perm = t.find((x) => x.date === '2025-07-31')!;
    expect(perm).toMatchObject({ type: 'Transfer', amount: 75000000, completed: true });
    expect(perm.fromTeam).toMatchObject({ name: 'Napoli' });
    expect(perm.toTeam?.logo).toContain('cdn.sportmonks.com');
    expect(t.find((x) => x.type === 'Loan')!.amount).toBeNull();
    expect(t.some((x) => x.type === 'End of loan')).toBe(true);
  });

  it('xG / piyasa değeri / kupa alanı modelde YOK (plan kapsamı dışı)', () => {
    const keys = Object.keys(profile);
    expect(keys).not.toContain('marketValue');
    expect(keys).not.toContain('trophies');
    expect(JSON.stringify(profile).toLowerCase()).not.toContain('xg');
  });

  it('boş/eksik yanıtta çökmez', () => {
    const p = mapPlayerProfile({ id: 1, display_name: 'X' });
    expect(p).toMatchObject({ id: 1, name: 'X', seasons: [], transfers: [] });
    expect(p.currentTeam).toBeUndefined();
  });
});

describe('formatStat', () => {
  it('rating 2 ondalık, yüzde, penaltı oranı, tam sayı; değer yoksa null', () => {
    expect(formatStat({ average: 7.5, highest: 9, lowest: 6 }, 'rating')).toBe('7.50');
    expect(formatStat({ total: 86.67 }, 'percent')).toBe('%86.7');
    expect(formatStat({ total: 1, scored: 1 }, 'ratio')).toBe('1/1');
    expect(formatStat({ total: 14 })).toBe('14');
    expect(formatStat(undefined)).toBeNull();
    expect(formatStat({})).toBeNull();
  });

  it('gruplar xG/piyasa değeri içermez ve type_id\'ler tekrarsız', () => {
    const ids = PLAYER_STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    const labels = PLAYER_STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.label.toLowerCase())).join(' ');
    expect(labels).not.toMatch(/xg|piyasa|değer/);
  });
});

describe('mapFixtureToPlayerMatchRow — gerçek fixture (19746625 Başakşehir–Galatasaray)', () => {
  const f = fixtureMatch as unknown as { played: { data: never }; absent: { data: never } };

  it('oynadığı maç: ilk 11, dakika 33, rating 6.9, 1 gol; deplasman skoru doğru yönde', () => {
    const row = mapFixtureToPlayerMatchRow(f.played.data, 455805, 34);
    expect(row).toMatchObject({ matchId: 19746625, date: '2026-09-04', isHome: false, opponent: 'İstanbul Başakşehir', inSquad: true, started: true, minutes: 33, rating: 6.9, goals: 1 });
    expect(row.assists).toBeUndefined(); // 0/yok → "0" değil undefined
    expect(row.score).toMatch(/^\d+-\d+$/);
  });

  it('kadroda olmadığı maç: inSquad=false, dakika/rating/gol yok', () => {
    const row = mapFixtureToPlayerMatchRow(f.absent.data, 455805, 34);
    expect(row).toMatchObject({ matchId: 19746612, inSquad: false, isHome: true, opponent: 'Kocaelispor' });
    expect(row.minutes).toBeUndefined();
    expect(row.rating).toBeUndefined();
  });
});

describe('sortSeasonRows / pickDefaultSeason — sezon içi takım kronolojisi', () => {
  const mk = (seasonId: number, seasonName: string, teamId: number, leagueName: string, apps: number) => ({
    seasonId,
    seasonName,
    teamId,
    leagueName,
    isCup: isCupCompetition(leagueName),
    stats: { 321: { total: apps } },
    startingAt: '2025-08-08',
    endingAt: '2026-05-17',
  });
  // Uğurcan Çakır 2025/26: Trabzonspor (geliş kaydı yok) → Galatasaray (2025-09-01 transfer)
  const rows = [
    mk(25580, '2025/2026', 34, 'Champions League', 5),
    mk(25682, '2025/2026', 34, 'Super Lig', 20),
    mk(25682, '2025/2026', 688, 'Super Lig', 3),
    mk(28203, '2026/2027', 34, 'Super Lig', 4),
    mk(23851, '2024/2025', 688, 'Super Lig', 30),
    mk(24546, '2024/2025', 688, 'Turkish Cup', 6),
  ];
  const sorted = sortSeasonRows(rows, [{ date: '2025-09-01', toTeam: { id: 34 } }]);

  it('sezon azalan; sezon içinde önceki takım önce; takım içinde lig kupadan önce', () => {
    expect(sorted.map((r) => `${r.seasonName}|${r.teamId}|${r.leagueName}`)).toEqual([
      '2026/2027|34|Super Lig',
      '2025/2026|688|Super Lig',
      '2025/2026|34|Super Lig',
      '2025/2026|34|Champions League',
      '2024/2025|688|Super Lig',
      '2024/2025|688|Turkish Cup',
    ]);
  });

  it('varsayılan: en güncel sezonun son takım bloğunun ilk (lig) satırı', () => {
    expect(pickDefaultSeason(sorted)).toMatchObject({ seasonName: '2026/2027', teamId: 34, leagueName: 'Super Lig' });
    const only2526 = sorted.filter((r) => r.seasonName === '2025/2026');
    expect(pickDefaultSeason(only2526)).toMatchObject({ teamId: 34, leagueName: 'Super Lig' });
  });
});
