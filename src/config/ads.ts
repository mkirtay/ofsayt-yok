/**
 * Reklam altyapısı bayrağı. VARSAYILAN KAPALI: `NEXT_PUBLIC_ADS_ENABLED=true` verilmedikçe hiçbir reklam/sponsor
 * alanı render edilmez. (Gerçek AdSense script'i, ads.txt, çerez izni banner'ı ve başvuru ayrı iş — bu dosya yalnızca
 * "gösterilsin mi?" kapısıdır.) `NEXT_PUBLIC_*` derleme/başlatma anında gömülür; değişince sunucu yeniden başlatılır.
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';
