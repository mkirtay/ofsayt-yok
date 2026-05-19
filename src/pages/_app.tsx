import type { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import Head from 'next/head'
import { Inter } from 'next/font/google'
import Layout from '@/components/Layout'
import PremiumModal from '@/components/PremiumModal'
import '@/styles/globals.scss'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
})

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <Head>
        <title>Ofsayt Yok</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Ofsayt Yok — Türkiye ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:site_name" content="Ofsayt Yok" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://ofsaytyok.com/images/logo.svg" />
        <meta name="twitter:card" content="summary" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={`${inter.className} ${inter.variable}`}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
        <PremiumModal />
      </div>
    </SessionProvider>
  )
}
