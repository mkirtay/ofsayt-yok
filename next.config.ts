import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";
import { NEWS_IMAGE_HOSTS } from "./src/config/newsImageHosts";

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
