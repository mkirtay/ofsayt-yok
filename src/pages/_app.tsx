import type { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import Head from 'next/head'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { appWithTranslation } from '@/lib/i18n'
import { createQueryClient } from '@/lib/queryClient'
import Layout from '@/components/Layout'
import PremiumModal from '@/components/PremiumModal'
import RouteProgress from '@/components/RouteProgress'
import '@/styles/globals.scss'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
})

function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
      <Head>
        <title>Ofsayt Yok</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Ofsayt Yok — Türkiye ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:site_name" content="Ofsayt Yok" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/logo.svg`} />
        <meta name="twitter:card" content="summary" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </Head>
      <div className={`${inter.className} ${inter.variable}`}>
        <RouteProgress />
        <Layout>
          <Component {...pageProps} />
        </Layout>
        <PremiumModal />
        <Analytics />
      </div>
      </QueryClientProvider>
    </SessionProvider>
  )
}

export default appWithTranslation(App)
