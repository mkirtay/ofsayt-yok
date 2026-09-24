import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Aynı klasörde ikinci bir `next dev` (ör. paralel önizleme) `.next/dev/lock` kilidine takılmasın diye
  // build klasörü env ile değiştirilebilir; varsayılan `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Üst dizindeki ekstra package-lock.json Turbopack'in yanlış root seçmesine yol açıyordu.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    // /uefa sayfası kaldırıldı (Şampiyonlar Ligi ana sayfadaki lig listesinden/filtresinden erişilir).
    return [{ source: '/uefa', destination: '/', permanent: true }];
  },
  images: {
    minimumCacheTTL: 2592000,
    deviceSizes: [640, 828, 1080, 1200, 1920],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    localPatterns: [
      { pathname: '/api/livescore/countries/flag' },
      { pathname: '/images/**' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  automaticVercelMonitors: false,
});
