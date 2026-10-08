import { describe, expect, it } from 'vitest';
import ugurcanFixture from '@/services/sportmonks/__fixtures__/playerCareerUgurcan.json';
import lamineFixture from '@/services/sportmonks/__fixtures__/playerCareerLamineYamal.json';
import { isCupCompetition, mapPlayerProfile, type PlayerSeasonStats, type RawPlayer } from '@/services/playerProfile';
import { buildPlayerCareer, shortSeasonName, type CareerRow } from './playerCareer';

const rawUgurcan = (ugurcanFixture as unknown as { data: RawPlayer }).data;
const rawLamine = (lamineFixture as unknown as { data: RawPlayer }).data;
const ugurcan = buildPlayerCareer(mapPlayerProfile(rawUgurcan).seasons);
const lamine = buildPlayerCareer(mapPlayerProfile(rawLamine).seasons);

const label = (r: CareerRow) => `${r.seasonName}|${r.teamName}|${r.leagueName}`;
const allRows = (c: typeof ugurcan) => c.groups.flatMap((g) => g.rows);

/** Ham yanıttan BAĞIMSIZ toplam: mapper/kariyer kodundan geçmeden doğrudan `statistics[].details[]`'tan. */
function rawTotals(raw: RawPlayer, pick: (cup: boolean) => boolean = () => true) {
  const t = { apps: 0, goals: 0, assists: 0 };
  for (const s of raw.statistics ?? []) {
    const sub = s.season?.league?.sub_type;
    if (!pick(sub !== 'domestic')) continue;
    for (const d of s.details ?? []) {
      const v = (d.value as { total?: number } | undefined)?.total ?? 0;
      if (d.type_id === 321) t.apps += v;
      if (d.type_id === 52) t.goals += v;
      if (d.type_id === 79) t.assists += v;
    }
  }
  return t;
}

describe('buildPlayerCareer — Uğurcan Çakır (201739, gerçek yanıt): Türkiye ligi, aynı sezon iki takım', () => {
  it('toplam: genel ve grup toplamları ham yanıtın bağımsız toplamıyla aynı', () => {
    expect(ugurcan.total).toEqual(rawTotals(rawUgurcan));
    expect(ugurcan.total).toEqual({ apps: 110, goals: 0, assists: 0 });
    const league = ugurcan.groups.find((g) => g.kind === 'league')!;
    const cup = ugurcan.groups.find((g) => g.kind === 'cup')!;
    expect(league.total).toEqual(rawTotals(rawUgurcan, (c) => !c));
    expect(cup.total).toEqual(rawTotals(rawUgurcan, (c) => c));
    expect(league.total.apps + cup.total.apps).toBe(ugurcan.total.apps);
    // satırların toplamı = grup toplamı (her grup için)
    for (const g of ugurcan.groups) expect(g.rows.reduce((n, r) => n + (r.apps ?? 0), 0)).toBe(g.total.apps);
  });

  it('aynı sezonda iki takım: ayrı satırlar, transferle gelinen (Galatasaray) üstte; takım toplamları ayrı', () => {
    const lig2526 = ugurcan.groups[0].rows.filter((r) => r.seasonName === '2025/2026');
    expect(lig2526.map((r) => [r.teamName, r.apps])).toEqual([
      ['Galatasaray', 25],
      ['Trabzonspor', 4],
    ]);
    expect(ugurcan.teams.map((t) => [t.teamName, t.apps])).toEqual([
      ['Galatasaray', 1 + 5 + 12 + 25],
      ['Trabzonspor', 4 + 2 + 4 + 32 + 5 + 2 + 2 + 5 + 4 + 7],
    ]);
    expect(ugurcan.teams.reduce((n, t) => n + t.apps, 0)).toBe(ugurcan.total.apps);
  });

  it('lig grubu önce, kupa/uluslararası ayrı; satırlar sezon azalan', () => {
    expect(ugurcan.groups.map((g) => g.kind)).toEqual(['league', 'cup']);
    expect(ugurcan.groups[0].rows.every((r) => !r.isCup)).toBe(true);
    expect(ugurcan.groups[1].rows.every((r) => r.isCup)).toBe(true);
    for (const g of ugurcan.groups) {
      const names = g.rows.map((r) => r.seasonName);
      expect(names).toEqual([...names].sort().reverse());
    }
    expect(ugurcan.groups[1].rows.map(label)).toContain('2024/2025|Trabzonspor|Turkish Cup');
  });

  it('veri olmayan sezon: has_values:false satırı (Galatasaray Türkiye Kupası 2025/26) hiç gösterilmez', () => {
    const rawRow = rawUgurcan.statistics!.find((s) => s.season_id === 26074 && s.team_id === 34)!;
    expect(rawRow.has_values).toBe(false);
    expect(allRows(ugurcan).some((r) => r.key === '26074-34')).toBe(false);
  });

  it('maç sayısı olmayan satır (2015/16, yalnız 90 dk): gösterilir, maç "—" (null), toplama katılmaz, dipnot bayrağı', () => {
    const row = allRows(ugurcan).find((r) => r.seasonName === '2015/2016')!;
    expect(row).toMatchObject({ teamName: 'Trabzonspor', leagueName: 'Europa League', apps: null, goals: 0, assists: 0 });
    expect(ugurcan.missingApps).toBe(true);
  });

  it('kaleci: gol/asist detayı yanıtta yok → 0 (Sportmonks sıfır değeri atıyor)', () => {
    expect(allRows(ugurcan).every((r) => r.goals === 0 && r.assists === 0)).toBe(true);
  });
});

describe('buildPlayerCareer — Lamine Yamal (37656179, gerçek yanıt): tek kulüp', () => {
  it('Copa Del Rey kupa grubunda (sub_type domestic_cup); lig grubunda yalnız La Liga', () => {
    const [league, cup] = lamine.groups;
    expect(league.rows.map((r) => r.leagueName)).toEqual(['La Liga', 'La Liga', 'La Liga']);
    expect(cup.rows.filter((r) => r.leagueName === 'Copa Del Rey')).toHaveLength(2);
  });

  it('toplamlar ham yanıtla aynı; tek takım', () => {
    expect(lamine.total).toEqual(rawTotals(rawLamine));
    expect(lamine.total).toEqual({ apps: 114, goals: 48, assists: 47 });
    expect(lamine.groups[0].total).toEqual({ apps: 70, goals: 32, assists: 29 });
    expect(lamine.teams).toHaveLength(1);
    expect(lamine.missingApps).toBe(false);
  });
});

describe('buildPlayerCareer — sentetik kenar durumlar', () => {
  const s = (key: string, seasonName: string, teamId: number, isCup: boolean, stats: PlayerSeasonStats['stats']): PlayerSeasonStats => ({
    key,
    isCup,
    seasonId: Number(key.split('-')[0]),
    seasonName,
    teamId,
    teamName: `T${teamId}`,
    leagueName: isCup ? 'Cup' : 'League',
    stats,
  });

  it('boş girdi → grup yok, toplam 0', () => {
    expect(buildPlayerCareer([])).toEqual({ groups: [], total: { apps: 0, goals: 0, assists: 0 }, teams: [], missingApps: false });
  });

  it('yalnız rating / dakikasız satır elenir; penaltılı gol `total`dan sayılır', () => {
    const c = buildPlayerCareer([
      s('1-1', '2025/2026', 1, false, { 321: { total: 3 }, 52: { total: 4, goals: 3, penalties: 1 } }),
      s('2-1', '2025/2026', 1, true, { 118: { average: 7 } }),
      s('3-1', '2024/2025', 1, false, { 321: { total: 0 }, 119: { total: 0 } }),
    ]);
    expect(c.groups).toHaveLength(1);
    expect(c.total).toEqual({ apps: 3, goals: 4, assists: 0 });
  });

  it('isCupCompetition: sub_type belirleyici; yoksa ad (Copa/Coppa/Pokal da kupa)', () => {
    expect(isCupCompetition('Copa Del Rey', 'domestic_cup')).toBe(true);
    expect(isCupCompetition('Super Lig', 'domestic')).toBe(false);
    expect(isCupCompetition('Champions League', 'cup_international')).toBe(true);
    expect(isCupCompetition('Copa Del Rey')).toBe(true);
    expect(isCupCompetition('Coppa Italia')).toBe(true);
    expect(isCupCompetition('DFB Pokal')).toBe(true);
    expect(isCupCompetition('Super Lig')).toBe(false);
    expect(isCupCompetition('La Liga')).toBe(false);
  });

  it('shortSeasonName', () => {
    expect(shortSeasonName('2025/2026')).toBe('2025/26');
    expect(shortSeasonName('2025')).toBe('2025');
  });
});
