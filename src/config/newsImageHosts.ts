/**
 * `next/image` optimizer'ına izin verilen uzak host'lar — yalnızca RSS haber görselleri (`/news/[id]` kapağı).
 * Liste dar tutulur: `remotePatterns: '**'` iken herkes `/_next/image?url=<herhangi bir adres>` ile Hobby'nin aylık
 * 5.000 dönüşüm kotasını bitirebiliyordu (kota dolunca yeni görseller 402 ile kırılır).
 * Kaynak: config/newsSources.ts'teki 5 RSS akışının görsel host'ları (2026-10-01'de akışlardan doğrulandı).
 * Listede olmayan bir host gelirse görsel optimize edilmeden gösterilir (`isOptimizableNewsImage`).
 */
export const NEWS_IMAGE_HOSTS = [
  'iasbh.tmgrup.com.tr', // Sabah
  'image.hurimg.com', // Hürriyet
  'im.haberturk.com', // Habertürk
  'image.cnnturk.com', // CNN Türk
  'ichef.bbci.co.uk', // BBC Sport
] as const;

const HOSTS = new Set<string>(NEWS_IMAGE_HOSTS);

/** `https` ve izinli host ise `true` — aksi halde `<Image unoptimized>` kullanılmalı (yoksa next/image hata fırlatır). */
export function isOptimizableNewsImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
