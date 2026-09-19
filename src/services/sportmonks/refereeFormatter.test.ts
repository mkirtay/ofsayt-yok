import { describe, it, expect } from 'vitest';
import { formatMainReferee, enrichReferees, REFEREE_TYPE_IDS } from './refereeFormatter';
import refereesTurkishCup from './__fixtures__/refereesTurkishCup.json';
import type { SportmonksRefereeRow } from './types';

describe('formatMainReferee', () => {
  it('gerçek veriden (Pass 2, fixture 19874792) type_id:6 olan orta hakemin adını döner', () => {
    expect(formatMainReferee(refereesTurkishCup as SportmonksRefereeRow[])).toBe('Şahin Berker');
  });

  it('CL finali (Pass 5, id 19683241) — düzyazıda geçen gerçek isimlerle çapraz test', () => {
    // Rapor bu 4 kaydı tam JSON olarak değil düzyazıda veriyor
    // ("6→Daniel Siebert, 7→Rafael Foltyn, 8→Jan Seidel, 9→Sandro Schärer").
    const clFinalReferees: SportmonksRefereeRow[] = [
      { referee_id: 1, type_id: 6, referee: { id: 1, name: 'Daniel Siebert', display_name: 'Daniel Siebert' } },
      { referee_id: 2, type_id: 7, referee: { id: 2, name: 'Rafael Foltyn', display_name: 'Rafael Foltyn' } },
      { referee_id: 3, type_id: 8, referee: { id: 3, name: 'Jan Seidel', display_name: 'Jan Seidel' } },
      { referee_id: 4, type_id: 9, referee: { id: 4, name: 'Sandro Schärer', display_name: 'Sandro Schärer' } },
    ];
    expect(formatMainReferee(clFinalReferees)).toBe('Daniel Siebert');
  });

  it('referees[] boş/null ise null döner', () => {
    expect(formatMainReferee([])).toBeNull();
    expect(formatMainReferee(null)).toBeNull();
  });

  it('type_id:6 kaydı var ama referee nested objesi yoksa null döner (rapordaki 3./4. kayıt gibi)', () => {
    const onlyAssistants: SportmonksRefereeRow[] = [{ referee_id: 838353, type_id: 8 }];
    expect(formatMainReferee(onlyAssistants)).toBeNull();
  });
});

describe('enrichReferees', () => {
  it('gerçek 4 kaydı (Pass 2) type_id sözlüğüyle (6/7/8/9) etiketler', () => {
    const enriched = enrichReferees(refereesTurkishCup as SportmonksRefereeRow[]);
    expect(enriched).toEqual([
      { refereeId: 13915, typeId: 6, role: 'Referee', name: 'Şahin Berker' },
      { refereeId: 65195, typeId: 7, role: '1st Assistant', name: 'Turan Çelik' },
      { refereeId: 838353, typeId: 8, role: '2nd Assistant', name: null },
      { refereeId: 1158400, typeId: 9, role: '4th Official', name: null },
    ]);
  });

  it('REFEREE_TYPE_IDS raporun 6/7/8/9/10 sözlüğüyle tutarlı', () => {
    expect(REFEREE_TYPE_IDS).toEqual({
      MAIN: 6,
      FIRST_ASSISTANT: 7,
      SECOND_ASSISTANT: 8,
      FOURTH_OFFICIAL: 9,
      VAR: 10,
    });
  });

  it('boş/null dizide boş dizi döner', () => {
    expect(enrichReferees(null)).toEqual([]);
    expect(enrichReferees([])).toEqual([]);
  });
});
