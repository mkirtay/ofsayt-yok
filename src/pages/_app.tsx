import type { AppProps } from 'next/app'
import Head from 'next/head'
import { Inter } from 'next/font/google'
import Layout from '@/components/Layout'
import '@/styles/globals.scss'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Ofsayt Yok</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={`${inter.className} ${inter.variable}`}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </div>
    </>
  )
}
