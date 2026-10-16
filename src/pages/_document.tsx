import { Html, Head, Main, NextScript, type DocumentProps } from 'next/document'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { returnUrlScriptForPage } from '@/lib/paymentReturnUrl'

export default function Document({ __NEXT_DATA__ }: DocumentProps) {
  // Ödeme dönüş sayfaları: Hikie'nin adrese eklediği kişisel sorgu (customerEmail, checkoutLinkToken …) HTML ayrıştırılırken,
  // Next / analitik betikleri çalışmadan silinir. Yalnız /odeme/tamamlandi ve /odeme/tekrar-dene HTML'ine girer.
  const paymentReturnScript = returnUrlScriptForPage(__NEXT_DATA__.page)
  return (
    <Html lang="tr" data-theme="dark">
      <Head>
        {paymentReturnScript ? <script dangerouslySetInnerHTML={{ __html: paymentReturnScript }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
