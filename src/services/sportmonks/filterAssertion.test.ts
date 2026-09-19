import { describe, it, expect } from 'vitest';
import { checkFilteredResult, assertFilteredResult } from './filterAssertion';

/**
 * docs/SPORTMONKS_MIGRATION.md Pass 5 satır 4: `GET /core/types?filters=
 * typeIds:51,52,53,54,55` isteği 200 OK döndü ama filtre HİÇ uygulanmadı —
 * rapor "200 (filtresiz sonuç döndü)" diyor, ama tam JSON'unu basmıyor
 * (sadece satır sayısını "count: 25" olarak not ediyor, id listesini değil).
 * Bu test, raporun tarif ettiği SENARYOYU 100% GERÇEK id/name çiftleriyle
 * (STATISTIC_TYPES sözlüğündeki 34/41/42 — Pass 5'te gerçekten çözülen
 * id'ler) yeniden kurar: beklenen filtre [51,52,53,54,55] iken, "hatalı API"
 * bunun yerine filtre DIŞI id'ler (34,41,42) içeren bir sonuç döndürüyor —
 * tam olarak raporun belgelediği sessiz-başarısızlık örüntüsü.
 */
type MockTypeRow = { id: number; name: string };

describe('checkFilteredResult', () => {
  it('gerçek filtre sessizce göz ardı edildiğinde (Pass 5 senaryosu) unexpectedIds ile yakalar', () => {
    const expectedIds = [51, 52, 53, 54, 55];
    // "Hatalı" response — filtre uygulanmamış, tamamen farklı (ama gerçek) id'ler geldi.
    const actualResponse: MockTypeRow[] = [
      { id: 34, name: 'Corners' },
      { id: 41, name: 'Shots Off Target' },
      { id: 42, name: 'Shots Total' },
    ];

    const result = checkFilteredResult(actualResponse, expectedIds, (row) => row.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unexpectedIds).toEqual([34, 41, 42]);
      expect(result.reason).toContain('sessizce uygulanmadı');
    }
  });

  it('filtre gerçekten çalıştığında (sonuç sadece beklenen id\'leri içerir) ok:true döner', () => {
    const expectedIds = [34, 41, 42];
    const actualResponse: MockTypeRow[] = [
      { id: 34, name: 'Corners' },
      { id: 41, name: 'Shots Off Target' },
    ];

    const result = checkFilteredResult(actualResponse, expectedIds, (row) => row.id);
    expect(result).toEqual({ ok: true });
  });

  it('beklenen id\'lerden bazılarının o an veride olmaması TEK BAŞINA hata sayılmaz (sadece fazlalık hata)', () => {
    // 55 beklenen kümede ama sonuçta yok — bu meşru olabilir (o kayıt bu ligde/sezonda yok).
    const expectedIds = [51, 52, 53, 54, 55];
    const actualResponse: MockTypeRow[] = [{ id: 51, name: 'Offsides' }, { id: 52, name: 'Goals' }];

    const result = checkFilteredResult(actualResponse, expectedIds, (row) => row.id);
    expect(result.ok).toBe(true);
  });

  it('boş sonuç dizisi her zaman geçerlidir (fazlalık id yok)', () => {
    expect(checkFilteredResult([], [1, 2, 3], (row: MockTypeRow) => row.id)).toEqual({ ok: true });
  });
});

describe('assertFilteredResult', () => {
  it('sessiz filtre hatasında fırlatır (Pass 5 senaryosu)', () => {
    const actualResponse: MockTypeRow[] = [{ id: 34, name: 'Corners' }];
    expect(() =>
      assertFilteredResult(actualResponse, [51, 52, 53], (row) => row.id),
    ).toThrow(/sessizce uygulanmadı/);
  });

  it('filtre doğru çalıştığında fırlatmaz', () => {
    const actualResponse: MockTypeRow[] = [{ id: 51, name: 'Offsides' }];
    expect(() =>
      assertFilteredResult(actualResponse, [51, 52, 53], (row) => row.id),
    ).not.toThrow();
  });
});
