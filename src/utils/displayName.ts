import { slugify } from './matchUrl';

const I_COMBINING_DOT = /i̇/g;

/**
 * Sportmonks'tan gelen görünen adlar (oyuncu, takım): önce NFC (ayrık "I + U+0307" → "İ", "e + U+0301" → "é" …),
 * sonra kalan "i + U+0307" → "i". Sportmonks bazı Türkçe adları İ'yi Türkçe olmayan küçük harfe çevrilmiş hâliyle
 * gönderiyor ("Emi̇r") — ekranda i'nin üstünde çift nokta görünüyordu. Yumuşak tire ve diğer ayrık aksanlar olduğu
 * gibi kalır. Yalnız GÖRÜNEN ad alanları için; id / arama anahtarı / slug üreten alanlara uygulanmaz.
 */
export function normalizeDisplayName(name: string): string;
export function normalizeDisplayName(name: string | null | undefined): string | null | undefined;
export function normalizeDisplayName(name: string | null | undefined): string | null | undefined {
  if (!name) return name;
  return name.normalize('NFC').replace(I_COMBINING_DOT, 'i');
}

/**
 * Takım adı: maç URL slug'ı takım adından üretildiği için (`buildMatchSlug`) normalize edilmiş adın slug'ı eskisinden
 * farklı çıkacaksa ad değiştirilmez — mevcut maç URL'leri birebir korunur.
 */
export function normalizeTeamName(name: string): string;
export function normalizeTeamName(name: string | null | undefined): string | null | undefined;
export function normalizeTeamName(name: string | null | undefined): string | null | undefined {
  const normalized = normalizeDisplayName(name);
  if (!name || normalized === name) return normalized;
  return slugify(normalized as string) === slugify(name) ? normalized : name;
}
