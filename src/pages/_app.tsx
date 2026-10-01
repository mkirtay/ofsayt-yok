import type { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import Head from 'next/head'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { appWithTranslation } from '@/lib/i18n'
import { createQueryClient } from '@/lib/queryClient'
import Layout from '@/components/Layout'
import RouteProgress from '@/components/RouteProgress'
import SignupAttributionSync from '@/components/SignupAttributionSync'
import '@/styles/globals.scss'

/**
 * Inter (v4.001, wght 400–900) iki parça — üretim: scripts/fonts/subset-inter.sh. Aynı aile adı, ayrı unicode-range:
 * - `inter`: Basic Latin + Latin-1 + Latin Extended-A (+ noktalama) — yalnız bu preload edilir (LCP kritik yolu).
 * - `interExt`: Latin Extended-B, vietnamca, kiril, yunan — preload yok; tarayıcı yalnız sayfada bu karakterler varsa indirir.
 * Fallback: globals.scss'teki 'Inter Fallback' (Arial + eski next/font/google metrikleri) — next/font/local'in alt kümeden
 * hesapladığı değerler farklı çıkıyor, eskileri korunur. Not: Turbopack sınıftaki aile adını değişken adından üretir
 * ("inter"); @font-face'teki "Inter" ile eşleşir (CSS aile adları büyük/küçük harfe duyarsız).
 */
const inter = localFont({
  src: '../styles/fonts/inter-latin.woff2',
  weight: '400 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-sans',
  adjustFontFallback: false,
  fallback: ['Inter Fallback'],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    {
      prop: 'unicode-range',
      value:
        'U+0000, U+0020-007E, U+00A0-00AC, U+00AE-0148, U+014A-017F, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+2002, U+2009, U+200B, U+2013-2014, U+2018-201A, U+201C-201E, U+2022, U+2026, U+2032-2033, U+2039-203A, U+2044, U+20AC, U+2122, U+2191, U+2193, U+2212, U+FEFF',
    },
  ],
})

const interExt = localFont({
  src: '../styles/fonts/inter-ext.woff2',
  weight: '400 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  // Yalnız @font-face'in sayfaya girmesi için kullanılır; yazı yığını `--font-sans` (aynı "Inter" ailesi).
  variable: '--font-sans-ext',
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    {
      prop: 'unicode-range',
      value:
        'U+0180-01C3, U+01C5-0254, U+0256-027B, U+027E-0284, U+0286-0290, U+0292-02A4, U+02A6-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0374-0376, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03D7, U+03DC-03DD, U+03F0-03F6, U+03F9-03FA, U+03FC-0479, U+0480-049D, U+04A0-04FF, U+052F, U+1D00, U+1D0D, U+1D1B, U+1D43, U+1D47-1D49, U+1D4D, U+1D4F-1D50, U+1D52, U+1D56-1D58, U+1D5B, U+1D62-1D65, U+1D9C, U+1DA0, U+1DBB, U+1DBF, U+1E00-1E9B, U+1E9D-1F15, U+1F18-1F1D, U+1F20-1F45, U+1F48-1F4D, U+1F50-1F57, U+1F59, U+1F5B, U+1F5D, U+1F5F-1F7D, U+1F80-1FB4, U+1FB6-1FC4, U+1FC6-1FD3, U+1FD6-1FDB, U+1FDD-1FEF, U+1FF2-1FF4, U+1FF6-1FFE, U+2020, U+20A0-20AB, U+20AD-20AF, U+20B1-20B5, U+20B8-20BA, U+20BC-20BF, U+2113, U+2116, U+2C7C, U+2C7F, U+2DFF, U+A69F, U+A7FF',
    },
  ],
})

function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
      <Head>
        <title>Ofsayt Yok</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Ofsayt Yok — Türkiye ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:site_name" content="Ofsayt Yok" />
        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:image" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/api/og/default`} key="og:image" />
        <meta property="og:image:width" content="1200" key="og:image:width" />
        <meta property="og:image:height" content="630" key="og:image:height" />
        <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </Head>
      <div data-app-root className={`${inter.className} ${inter.variable} ${interExt.variable}`}>
        <RouteProgress />
        <SignupAttributionSync />
        <Layout>
          <Component {...pageProps} />
        </Layout>
        <Analytics />
      </div>
      </QueryClientProvider>
    </SessionProvider>
  )
}

export default appWithTranslation(App)
