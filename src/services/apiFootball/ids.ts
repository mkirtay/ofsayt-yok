/**
 * Milli maçlar (API-Football, "AF") kimlik uzayı — Sportmonks (SM) ve eski livescore id'leriyle ASLA çakışmasın diye.
 *
 * Kural: uygulama id'si = AF id + 2_000_000_000 (int4 sınırı 2_147_483_647; AF id'leri ~1,6M, yani 2e9 + 147M'e kadar yer var →
 * şema değişikliği / migration yok). Aynı kayma maçın TAKIM, LİG ve OYUNCU id'lerine de uygulanır: sayfadaki hiçbir
 * bağlantı / istek bir milli maç id'sini yanlışlıkla bir Sportmonks kaydı sanmaz (sessizce yanlış veri yerine "yok").
 * SM'in en büyük bilinen id'leri ~20M; 2e9 altı SM, üstü AF.
 *
 * NOT (kapsam dışı, sonraki aşama): favori takım / lig id'leri DB'de `Int[]`; AF takım id'leri kaydırılmış (2e9+) olarak
 * yazılacağı için çakışma yok ama kayma kuralı favori yazan/okuyan her yerde bilinmeli.
 */
export const AF_ID_OFFSET = 2_000_000_000;

/** Ham AF id'si → uygulama id'si. */
export function toAppId(afId: number): number {
  return afId + AF_ID_OFFSET;
}

/** Uygulama id'si → ham AF id'si (`isNationalMatchId` değilse null). */
export function toAfId(appId: string | number | null | undefined): number | null {
  const s = String(appId ?? '').trim();
  if (!/^\d{1,12}$/.test(s)) return null;
  const n = Number(s);
  return n >= AF_ID_OFFSET && n <= 2_147_483_647 ? n - AF_ID_OFFSET : null;
}

/** Maç / takım / lig id'si AF uzayında mı (>= 2e9)? */
export function isNationalMatchId(id: string | number | null | undefined): boolean {
  return toAfId(id) != null;
}
