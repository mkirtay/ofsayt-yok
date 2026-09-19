/**
 * Sportmonks `venue` objesini mevcut `Match.location: string` alanının
 * beklediği tek-satır formata çevirir.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 3 "location/venue" bölümü.
 * ÖNEMLİ KISIT: rapor bu formatın (`${venue.name}, ${venue.city_name}`)
 * mevcut `location` alanının GERÇEK biçimiyle eşleştiğini DOĞRULAYAMADI —
 * Pass 3 Soru 5'te livescore-api.com anahtarı 401 verdi, Redis cache boştu,
 * Postgres'te `location` hiç saklanmıyordu. Bu yüzden bu fonksiyon raporun
 * "makul öneri" olarak işaretlediği formatı uyguluyor, kesinleşmiş bir
 * eşleme değil — canlı bir `location` örneğiyle karşılaştırılana kadar
 * doğrulanmamış sayılmalı.
 */
import type { SportmonksVenue } from './types';

export function formatVenueLocation(
  venue: Pick<SportmonksVenue, 'name' | 'city_name'> | null | undefined,
): string | null {
  if (!venue) return null;
  const parts = [venue.name, venue.city_name].filter(
    (part): part is string => Boolean(part && part.trim().length > 0),
  );
  if (parts.length === 0) return null;
  return parts.join(', ');
}
