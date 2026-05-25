import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: false,
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
