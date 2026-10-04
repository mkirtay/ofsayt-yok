/**
 * Hakem ve teknik direktör sayfalarının adresi: `/hakem/{ad-soyad}-{id}`, `/teknik-direktor/{ad-soyad}-{id}`.
 * Çözümleme yalnız sondaki id'yle; ad değişirse sayfa doğru slug'a 301 verir (bkz. pages/hakem/[slug].tsx).
 */
import { slugify } from '@/utils/matchUrl';

export const REFEREE_BASE_PATH = '/hakem';
export const COACH_BASE_PATH = '/teknik-direktor';

export function personSlug(name: string | null | undefined, id: number): string {
  const s = slugify(name ?? '');
  return s ? `${s}-${id}` : String(id);
}

export function refereeHref(id: number, name?: string | null): string {
  return `${REFEREE_BASE_PATH}/${personSlug(name, id)}`;
}

export function coachHref(id: number, name?: string | null): string {
  return `${COACH_BASE_PATH}/${personSlug(name, id)}`;
}

/** Slug'ın sonundaki id (`batuhan-kolak-62331` → 62331, `62331` → 62331); yoksa null. */
export function personIdFromSlug(slug: string | null | undefined): number | null {
  const m = /(?:^|-)(\d{1,12})$/.exec(String(slug ?? '').trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
