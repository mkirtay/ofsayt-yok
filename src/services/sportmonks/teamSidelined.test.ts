import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/teamSidelined.gs-2026-10-02.json';
import { mapTeamSidelined, type SportmonksSidelinedRow } from './teamSidelined';

// Gerçek yanıt (GS, 2026-10-02): 11 kayıt — 7 NO_ELIGIBILITY (6 farklı oyuncu), 3 sakatlık, 1 kırmızı kart cezası.
const rows = fixture.sidelined as SportmonksSidelinedRow[];

describe('mapTeamSidelined (gerçek GS yanıtı)', () => {
  it('UEFA kadrosunda olmayanlar listeye girmez, oyuncu bazında sayılır; sakatlar önce, dönüşe göre', () => {
    const out = mapTeamSidelined(rows, '2026-10-02');
    expect(out.notInUefaSquad).toBe(6);
    expect(out.players.map((p) => [p.name, p.reasons.map((r) => r.code).join('+'), p.until ?? null])).toEqual([
      ['Wilfried Singo', 'MUSCLE_INJURY', '2026-10-14'],
      ['Roland Sallai', 'TORN_THIGH_MUSCLE', '2026-10-18'],
      ['Kaan Ayhan', 'ACHILLES_TENDON_PROBLEMS', null],
      ['Lesley Ugochukwu', 'RED_CARD_SUSPENSION', '2026-10-18'],
    ]);
    expect(out.players[3]!.reasons[0]!.category).toBe('suspended');
  });

  it('bitiş tarihi geçmiş ya da tamamlanmış kayıt gösterilmez', () => {
    const out = mapTeamSidelined(rows, '2026-10-15');
    expect(out.players.map((p) => p.name)).not.toContain('Wilfried Singo');
    const done = mapTeamSidelined([{ ...rows[8]!, completed: true }], '2026-10-02');
    expect(done.players).toEqual([]);
  });

  it('aynı oyuncunun iki süren kaydı tek satırda; açık uçlu kayıt dönüş tarihini kaldırır', () => {
    const base = rows.find((r) => r.type?.developer_name === 'RED_CARD_SUSPENSION')!;
    const out = mapTeamSidelined(
      [base, { ...base, id: 99, category: 'injury', end_date: null, type: { id: 1, name: 'Knee Injury', developer_name: 'KNEE_INJURY' } }],
      '2026-10-02',
    );
    expect(out.players).toHaveLength(1);
    expect(out.players[0]!.reasons.map((r) => r.code)).toEqual(['RED_CARD_SUSPENSION', 'KNEE_INJURY']);
    expect(out.players[0]!.until).toBeUndefined();
  });
});
