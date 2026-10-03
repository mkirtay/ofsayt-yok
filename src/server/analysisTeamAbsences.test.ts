import { describe, expect, it } from 'vitest';
import { buildAbsences } from './analysisTeamAbsences';
import { mapTeamSidelined, type SportmonksSidelinedRow } from '@/services/sportmonks/teamSidelined';

const row = (o: Partial<SportmonksSidelinedRow> & { player_id: number; name: string; dev: string; cat: string }): SportmonksSidelinedRow => ({
  id: o.player_id * 10,
  player_id: o.player_id,
  category: o.cat,
  start_date: '2026-09-01',
  end_date: o.end_date ?? null,
  completed: o.completed ?? false,
  player: { id: o.player_id, display_name: o.name },
  type: { id: 1, name: o.dev === 'NO_ELIGIBILITY' ? 'No Eligibility' : o.dev, developer_name: o.dev },
});

describe('analiz bağlamı — sakat/cezalı oyuncular', () => {
  const rows = [
    row({ player_id: 1, name: 'Forvet Oyuncu', dev: 'KNEE_INJURY', cat: 'injury', end_date: '2026-10-20' }),
    row({ player_id: 2, name: 'Cezalı Stoper', dev: 'RED_CARD_SUSPENSION', cat: 'suspended', end_date: '2026-10-12' }),
    row({ player_id: 3, name: 'UEFA Listesinde Yok', dev: 'NO_ELIGIBILITY', cat: 'suspended', end_date: '2027-01-28' }),
    row({ player_id: 4, name: 'Maçtan Önce Dönen', dev: 'ANKLE_INJURY', cat: 'injury', end_date: '2026-10-05' }),
    row({ player_id: 5, name: 'Açık Uçlu', dev: 'ACL_INJURY', cat: 'injury' }),
  ];

  it('maç gününe göre süzer, NO_ELIGIBILITY almaz; mevki ve sezon katkısı kadrodan gelir', () => {
    const sidelined = mapTeamSidelined(rows, '2026-10-09');
    const list = buildAbsences(sidelined, {
      1: { appearances: 6, goals: 4, assists: 1, detailedPositionId: 151 },
      2: { appearances: 5, goals: 0, assists: 0 },
    });
    expect(list.map((p) => p.name)).toEqual(['Forvet Oyuncu', 'Açık Uçlu', 'Cezalı Stoper']);
    expect(list[0]).toMatchObject({ kind: 'injury', reason: 'KNEE_INJURY', until: '2026-10-20', apps: 6, goals: 4, assists: 1 });
    expect(list[0]!.position).toBeTruthy();
    expect(list[1]).toEqual({ name: 'Açık Uçlu', kind: 'injury', reason: 'ACL_INJURY' });
    expect(list[2]).toMatchObject({ kind: 'suspended', until: '2026-10-12', apps: 5, goals: 0, assists: 0 });
    expect(list[2]!.position).toBeUndefined();
  });

  it('kayıt yoksa boş liste', () => {
    expect(buildAbsences(mapTeamSidelined([], '2026-10-09'), {})).toEqual([]);
  });
});
