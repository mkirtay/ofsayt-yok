import type { Match } from '@/models/liveScore';

/**
 * Türkçe karakterleri ASCII karşılıklarına dönüştürüp URL-safe slug üretir.
 * Örn: "Trabzonspor" → "trabzonspor", "Başakşehir FK" → "basaksehir-fk"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Maç için SEO slug üretir: "{home}-{away}"
 * Örn: "trabzonspor-galatasaray"
 */
export function buildMatchSlug(match: {
  home?: { name?: string } | null;
  away?: { name?: string } | null;
  home_name?: string;
  away_name?: string;
}): string {
  const home = match.home?.name || match.home_name || '';
  const away = match.away?.name || match.away_name || '';
  if (!home && !away) return '';
  return `${slugify(home)}-${slugify(away)}`;
}

/**
 * Canonical maç URL'i: "/matches/{id}-{slug}"
 */
export function buildMatchHref(match: Pick<Match, 'id'> & {
  home?: { name?: string } | null;
  away?: { name?: string } | null;
  home_name?: string;
  away_name?: string;
}): string {
  const slug = buildMatchSlug(match);
  if (!slug) return `/matches/${match.id}`;
  return `/matches/${match.id}-${slug}`;
}

/**
 * URL parametresinden matchId'yi ayrıştırır.
 * "123-trabzonspor-galatasaray" → "123"
 * "123" → "123"
 */
export function parseMatchIdFromParam(idAndSlug: string): string {
  const idx = idAndSlug.indexOf('-');
  if (idx === -1) return idAndSlug;
  const candidate = idAndSlug.slice(0, idx);
  if (/^\d+$/.test(candidate)) return candidate;
  return idAndSlug;
}

/**
 * URL parametresinin id'den sonraki slug kısmı ("123-trabzonspor-galatasaray" → "trabzonspor-galatasaray").
 * Slug yoksa (yalnız id) ya da parametre id ile başlamıyorsa boş string.
 */
export function parseMatchSlugFromParam(idAndSlug: string): string {
  const idx = idAndSlug.indexOf('-');
  if (idx === -1) return '';
  if (!/^\d+$/.test(idAndSlug.slice(0, idx))) return '';
  return idAndSlug.slice(idx + 1);
}

/**
 * Karşılaştırma için slug normalizasyonu — `buildMatchSlug` ile AYNI kurallar (küçük harf, Türkçe
 * karakterler, ayraçlar). `slugify` idempotent: sitenin ürettiği slug değişmeden kalır, elle yazılmış
 * ya da yüzde-kodlu ("Fenerbah%C3%A7e") biçim aynı sonuca iner.
 */
export function normalizeMatchSlug(raw: string): string {
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    // bozuk yüzde kodlaması → olduğu gibi normalize et
  }
  return slugify(s);
}

/**
 * URL'deki slug, maçın takımlarından sitenin ürettiği slug ile birebir aynı mı (bulanık eşleştirme yok).
 * Maçın takım adı hiç yoksa site slug'sız URL üretir → karşılaştırılacak bir şey yok, `true`.
 */
export function matchSlugMatches(
  urlSlug: string,
  match: Parameters<typeof buildMatchSlug>[0],
): boolean {
  const expected = normalizeMatchSlug(buildMatchSlug(match));
  if (!expected) return true;
  return normalizeMatchSlug(urlSlug) === expected;
}
