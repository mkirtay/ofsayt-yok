import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";
import { NEWS_IMAGE_HOSTS } from "./src/config/newsImageHosts";

/**
 * Güvenlik başlıkları (tüm yanıtlar). Tam CSP ayrı iş (satır içi betikler için nonce/hash gerekir); şimdilik CSP yalnız
 * `frame-ancestors` — tıklama tuzağı (giriş / kredi / ödeme sayfaları başka sitede çerçeveye alınamaz). Turnstile kendi
 * iframe'ini bizim sayfamıza gömer; bu başlıklar onu etkilemez.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // .app üst alan adı zaten HSTS önyüklü; başlık yine de açık (önizleme / özel alan adları).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=()' },
];

/**
 * sharp'ın bağlandığı libvips-cpp paylaşımlı kütüphanesi (kurulu platform paketinin `./binary` dışa aktarımı: tam dosya
 * yolu). Glob değil tam yol: Turbopack include kalıplarını "içerir" diye eşler; `node_modules/@img/…` kalıbı Next'in
 * kendi iç içe (kullanılmayan, 0.34) sharp'ının libvips'ini de çekiyordu (+~16 MB). Vercel'de yalnız linux-x64 kurulu;
 * darwin girdileri yerel build trace denetimi içindir.
 */
function sharpLibvipsTrace(): string[] {
  const files: string[] = [];
  for (const pkg of ['@img/sharp-libvips-linux-x64', '@img/sharp-libvips-darwin-arm64', '@img/sharp-libvips-darwin-x64']) {
    try {
      files.push(path.relative(__dirname, require.resolve(`${pkg}/binary`)));
    } catch {
      // bu platformun paketi kurulu değil
    }
  }
  return files;
}
const SHARP_LIBVIPS_TRACE = sharpLibvipsTrace();

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Aynı klasörde ikinci bir `next dev` (ör. paralel önizleme) `.next/dev/lock` kilidine takılmasın diye
  // build klasörü env ile değiştirilebilir; varsayılan `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Üst dizindeki ekstra package-lock.json Turbopack'in yanlış root seçmesine yol açıyordu.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Prisma (engineType "library", binaryTargets yok, driver adapter yok) yalnız native motoru + runtime/library.js
  // yükler. Trace ise @prisma/client/runtime altındaki 5 veritabanının WASM motor/derleyicilerini (js + mjs) ve
  // .prisma/client/*.wasm'ı da DB kullanan her fonksiyona koyuyordu: fonksiyon başına ~57 MB (Vercel Functions Storage).
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@prisma/client/runtime/*wasm-base64*',
      'node_modules/@prisma/client/runtime/binary.*',
      'node_modules/.prisma/client/*.wasm',
    ],
  },
  // sharp ≥0.35 girişi `dist/index.cjs`; @vercel/nft'nin sharp özel durumu hâlâ `sharp/lib/index.js` arıyor → platform
  // `.node` dosyası trace'e giriyor ama bağlandığı libvips-cpp paylaşımlı kütüphanesi girmiyor; Vercel'de
  // "libvips-cpp.so…: cannot open shared object file" (500). sharp kullanan fonksiyonlara açıkça eklenir; build sonrası
  // denetim: scripts/check-sharp-trace.mjs (postbuild).
  outputFileTracingIncludes: {
    '/api/img/logo': SHARP_LIBVIPS_TRACE,
    '/api/og/**': SHARP_LIBVIPS_TRACE,
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  async redirects() {
    // /uefa sayfası kaldırıldı (Şampiyonlar Ligi ana sayfadaki lig listesinden/filtresinden erişilir).
    return [{ source: '/uefa', destination: '/', permanent: true }];
  },
  images: {
    minimumCacheTTL: 2592000,
    deviceSizes: [640, 828, 1080, 1200, 1920],
    // Yalnızca haber kapak görselleri optimize edilir (bkz. src/config/newsImageHosts.ts); diğer uzak görseller
    // `unoptimized` ya da düz <img>. Joker host kota kötüye kullanımına açıktı.
    remotePatterns: NEWS_IMAGE_HOSTS.map((hostname) => ({ protocol: 'https' as const, hostname, pathname: '/**' })),
    localPatterns: [{ pathname: '/images/**' }],
  },
};

const sentryConfig = withSentryConfig(nextConfig, {
  // CI'da (Vercel build) Sentry çıktısı görünsün: kaynak haritası yüklemesi build loglarından doğrulanabilsin.
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  automaticVercelMonitors: false,
});

/**
 * Sentry, sayfa yüklemesi tracing'i için `experimental.clientTraceMetadata` (sentry-trace + baggage) açıyor → Next her
 * render'da HTML'e RASTGELE trace id'li <meta> basıyor. Tracing kullanılmıyor (`tracesSampleRate` yok; bkz.
 * sentry.server.config.ts) ama bu etiketler her ISR yeniden üretimini "içerik değişti" yapıyordu (ana sayfa: veri aynı
 * olsa da ISR yazımı + CDN tazelemesi). Hata izleme etkilenmez.
 */
export default {
  ...sentryConfig,
  experimental: { ...sentryConfig.experimental, clientTraceMetadata: [] },
} satisfies NextConfig;
