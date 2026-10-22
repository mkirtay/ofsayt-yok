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
import type { MatchVenue, MatchVenueSurface } from '@/models/liveScore';
import { sportmonksImagePath } from '@/utils/logoUrl';
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

/** Sportmonks `surface` serbest metin ("grass", "artificial turf", "hybrid grass"…) → kart türü; tanınmayan → yok. */
export function mapVenueSurface(raw: string | null | undefined): MatchVenueSurface | undefined {
  const s = raw?.trim().toLowerCase() ?? '';
  if (!s) return undefined;
  if (s.includes('hybrid')) return 'hybrid';
  if (/artificial|synthetic|astro/.test(s)) return 'artificial';
  if (/grass|natural/.test(s)) return 'grass';
  if (s.includes('turf')) return 'artificial';
  return undefined;
}

function coord(raw: string | number | null | undefined, max: number): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) && Math.abs(n) <= max ? n : undefined;
}

const clean = (v: string | null | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Maç sayfası "Stadyum" kartı. Aynı `fixtures/{id}` yanıtındaki `venue` (include alan seçimsiz → nesnenin tamamı zaten
 * geliyor; ek istek / ek bayt yok). Yalnız dolu alanlar; koordinat ikisi birlikte geçerliyse (0,0 = yok), fotoğraf
 * yalnız Sportmonks CDN'inden ve yer tutucu değilse. Hiç alan yoksa `undefined`.
 */
export function mapMatchVenue(venue: SportmonksVenue | null | undefined): MatchVenue | undefined {
  if (!venue) return undefined;
  const name = clean(venue.name);
  const city = clean(venue.city_name);
  const address = clean(venue.address);
  const capacity = typeof venue.capacity === 'number' && Number.isFinite(venue.capacity) && venue.capacity > 0
    ? Math.round(venue.capacity)
    : undefined;
  const surface = mapVenueSurface(venue.surface);
  const lat = coord(venue.latitude, 90);
  const lng = coord(venue.longitude, 180);
  const hasCoords = lat !== undefined && lng !== undefined && !(lat === 0 && lng === 0);
  const imageRaw = clean(venue.image_path);
  const image = imageRaw && sportmonksImagePath(imageRaw) && !/placeholder/i.test(imageRaw) ? imageRaw : undefined;
  const out: MatchVenue = {
    ...(name ? { name } : {}),
    ...(city ? { city } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
    ...(surface ? { surface } : {}),
    ...(address ? { address } : {}),
    ...(hasCoords ? { lat, lng } : {}),
    ...(image ? { image } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/**
 * Kart çizilsin mi: ad / şehir maç kartının bilgi satırında zaten var → kart yalnız bunların ÖTESİNDE bir bilgi varsa
 * (fotoğraf, kapasite, zemin, adres, konum).
 */
export function hasVenueCard(v: MatchVenue | null | undefined): v is MatchVenue {
  if (!v) return false;
  return Boolean(v.image || v.capacity || v.surface || v.address || (v.lat !== undefined && v.lng !== undefined));
}

/** Google Haritalar arama bağlantısı (anahtar gerektirmez); konum yoksa `null`. */
export function venueMapsUrl(v: Pick<MatchVenue, 'lat' | 'lng'>): string | null {
  if (v.lat === undefined || v.lng === undefined) return null;
  return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
}
