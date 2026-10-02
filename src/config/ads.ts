/**
 * Reklam altyapısı bayrağı. VARSAYILAN KAPALI: `NEXT_PUBLIC_ADS_ENABLED=true` verilmedikçe hiçbir reklam/sponsor
 * alanı render edilmez. (Gerçek AdSense script'i, ads.txt, çerez izni banner'ı ve başvuru ayrı iş — bu dosya yalnızca
 * "gösterilsin mi?" kapısıdır.) `NEXT_PUBLIC_*` derleme/başlatma anında gömülür; değişince sunucu yeniden başlatılır.
 *
 * AdSense planı (2026-10-02) — reklamsız kalacak yüzeyler: maç sayfasının AI Analiz sekmesi ve /ai-istatistikleri
 * (tahmin içeriği; kumar politikası riski), /credits, /profile, /auth/*, /iletisim, yasal sayfalar, 404/500, /admin,
 * Gündem / forum (moderasyon oturana kadar). Mobilde ilk ekranda reklam yok. Vercel Pro'ya geçmeden açılmaz.
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';
