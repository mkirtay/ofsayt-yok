import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/teamLoans.gs-2026-10-21.json';
import { activeLoan, mapTeamLoans, type SportmonksExtendedSquadRow } from './teamLoans';

// Gerçek yanıt (GS 34, 2026-10-21, `squads/teams/34/extended?include=TEAM_LOANS_INCLUDE`): kadro dışı 25 oyuncunun
// tamamı + 2 kadro oyuncusu (alanlar kırpıldı).
const rows = fixture as SportmonksExtendedSquadRow[];
const GS = 34;
const TODAY = '2026-10-21';

describe('mapTeamLoans (gerçek GS yanıtı)', () => {
  it('yalnız süren kiralıklar: kalıcı ayrılan, dönüşü biten, başka kulübün kiralığı ve altyapı girmez', () => {
    const out = mapTeamLoans(rows, GS, TODAY);
    expect(out.map((p) => [p.name, p.club.name, p.since, p.until ?? null])).toEqual([
      ['Carlos Cuesta', 'Vasco da Gama', '2025-09-01', '2026-12-31'],
      ['Elias Jelert', 'Le Havre', '2026-08-21', '2027-06-30'],
      ['Metehan Baltacı', 'Gençlerbirliği', '2026-08-21', '2027-06-30'],
      ['Przemyslaw Frankowski', 'Rennes', '2025-08-05', '2027-06-30'],
      ['Ahmed Kutucu', 'Rizespor', '2026-07-19', '2027-06-30'],
    ]);
    const names = out.map((p) => p.name);
    for (const gone of ['Mauro Icardi', 'Dries Mertens', 'Álvaro Morata', 'Sacha Boey', 'Noa Lang', 'Yáser Asprilla', 'Ege Araç']) {
      expect(names).not.toContain(gone);
    }
  });

  it('kulüp logosu, mevki ve foto taşınır', () => {
    const kutucu = mapTeamLoans(rows, GS, TODAY).find((p) => p.name === 'Ahmed Kutucu')!;
    expect(kutucu.club.id).toBe(1041);
    expect(kutucu.club.logo).toMatch(/^https:\/\/cdn\.sportmonks\.com\//);
    expect(kutucu.positionId).toBe(27);
    expect(kutucu.photo).toMatch(/^https:\/\//);
  });

  it('kiralık dönüşü geçince oyuncu listeden çıkar (Cuesta 2026-12-31)', () => {
    expect(mapTeamLoans(rows, GS, '2027-01-02').map((p) => p.name)).not.toContain('Carlos Cuesta');
  });

  it('kadro oyuncusu (in_squad) hiç girmez; başka takım id’siyle bu kiralıklar sayılmaz', () => {
    const inSquad = rows.filter((r) => r.in_squad);
    expect(inSquad.length).toBeGreaterThan(0);
    expect(inSquad.every((r) => activeLoan(r, GS, TODAY) == null)).toBe(true);
    expect(mapTeamLoans(rows, 88, TODAY)).toEqual([]);
  });

  it('2 yıldan eski, dönüş kaydı olmayan kiralık bayat sayılır', () => {
    const row: SportmonksExtendedSquadRow = {
      id: 1,
      display_name: 'Eski Kiralık',
      in_squad: false,
      transfers: [{ id: 5, from_team_id: GS, to_team_id: 99, date: '2023-08-01', type_id: 218, toteam: { id: 99, name: 'X' } }],
    };
    expect(activeLoan(row, GS, TODAY)).toBeNull();
    expect(activeLoan(row, GS, '2025-07-01')?.club.name).toBe('X');
    expect(activeLoan(row, GS, '2025-07-01')?.until).toBeUndefined();
  });

  it('gelecekteki transferler bugünün durumunu değiştirmez; kulüp adı yoksa satır yok', () => {
    const row: SportmonksExtendedSquadRow = {
      id: 2,
      display_name: 'A',
      in_squad: false,
      transfers: [
        { id: 1, from_team_id: GS, to_team_id: 7, date: '2026-08-01', type_id: 218, toteam: { id: 7, name: 'Y' } },
        { id: 2, from_team_id: 7, to_team_id: 8, date: '2026-12-01', type_id: 219, toteam: { id: 8, name: 'Z' } },
      ],
    };
    expect(activeLoan(row, GS, TODAY)?.club.name).toBe('Y');
    expect(activeLoan(row, GS, '2026-12-01')).toBeNull();
    expect(activeLoan({ ...row, transfers: [{ ...row.transfers![0]!, toteam: null }] }, GS, TODAY)).toBeNull();
  });

  it('boş / eksik girdi', () => {
    expect(mapTeamLoans(null, GS, TODAY)).toEqual([]);
    expect(mapTeamLoans([{ id: 3, in_squad: false }], GS, TODAY)).toEqual([]);
  });
});
