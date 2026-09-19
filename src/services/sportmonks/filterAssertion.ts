/**
 * `filters=...` kullanan bir Sportmonks çağrısının GERÇEKTEN filtrelenmiş
 * olup olmadığını doğrular.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 5 "Risk kategorisi notu".
 * `GET /core/types?filters=typeIds:51,52,53,54,55` isteği **200 OK** döndü
 * ama filtre hiç uygulanmadı — filtresiz/tüm sonuç seti geldi. Bu, raporun
 * diğer hatalarından (yanlış `state.short_name`, yanlış parametre sırası —
 * ikisi de 4xx ile GÖRÜNÜR şekilde başarısız oldu) NİTELİKSEL OLARAK farklı:
 * SESSİZ bir başarısızlık. Sadece HTTP durum koduna bakmak yeterli değil —
 * dönen veri setinin beklenen alt kümeyle eşleştiği ayrıca kontrol edilmeli.
 */

export type FilterAssertionResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      unexpectedIds: Array<string | number>;
      missingIds: Array<string | number>;
    };

/**
 * `results`'taki her öğenin id'sinin `expectedIds` kümesinde olduğunu
 * doğrular. `getId` ile öğeden id çıkarma şekli verilir (Sportmonks
 * response'ları arasında id alanının adı değişebiliyor — `id`, `type_id` vb.)
 *
 * Sadece "fazladan/beklenmeyen id var mı" kontrol edilir — `expectedIds`'in
 * tamamının sonuçta bulunmasını ZORUNLU KILMAZ (bir filtre, istenen id'lerden
 * bazılarının o an veride olmaması nedeniyle meşru şekilde eksik dönebilir;
 * asıl SESSİZ HATA belirtisi, filtrenin dışındaki id'lerin sızmasıdır).
 */
export function checkFilteredResult<T>(
  results: T[],
  expectedIds: Array<string | number>,
  getId: (item: T) => string | number,
): FilterAssertionResult {
  const expectedSet = new Set(expectedIds.map(String));
  const actualIds = results.map(getId);
  const unexpectedIds = actualIds.filter((id) => !expectedSet.has(String(id)));

  if (unexpectedIds.length > 0) {
    return {
      ok: false,
      reason:
        `Filtre sonucu beklenen id kümesinin dışında ${unexpectedIds.length} kayıt içeriyor — ` +
        `filtre muhtemelen sessizce uygulanmadı (bkz. Pass 5 "Risk kategorisi notu").`,
      unexpectedIds,
      missingIds: expectedIds.filter((id) => !actualIds.map(String).includes(String(id))),
    };
  }

  return { ok: true };
}

/** `checkFilteredResult` başarısızsa fırlatan varyant — runtime guard olarak kullanım için. */
export function assertFilteredResult<T>(
  results: T[],
  expectedIds: Array<string | number>,
  getId: (item: T) => string | number,
): void {
  const result = checkFilteredResult(results, expectedIds, getId);
  if (!result.ok) {
    throw new Error(
      `${result.reason} Beklenmeyen id'ler: [${result.unexpectedIds.slice(0, 10).join(', ')}` +
        `${result.unexpectedIds.length > 10 ? ', ...' : ''}]`,
    );
  }
}
