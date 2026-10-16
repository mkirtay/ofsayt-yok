import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { returnUrlToReplace } from '@/lib/paymentReturnUrl';

/**
 * Ödeme dönüş sayfası gizliliği (görsel yok): dışarı giden isteklerde adres gönderilmez (Referrer-Policy no-referrer;
 * aynı başlık next.config'te de) ve istemci içi gezinmede de Hikie sorgusu adresten silinir. Asıl temizlik ilk yüklemede
 * _document'taki satır içi betikte (lib/paymentReturnUrl.ts); bu efekt yedek.
 */
export default function PaymentReturnPrivacy({ keepOrderId }: { keepOrderId: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const { pathname, search, hash } = window.location;
    const target = returnUrlToReplace(pathname, search, hash, keepOrderId);
    // `locale: false`: hedef yol dil önekini (/en) zaten içerir.
    if (target) void router.replace(target, undefined, { shallow: true, locale: false });
  }, [router, keepOrderId]);
  return (
    <Head>
      <meta name="referrer" content="no-referrer" key="referrer" />
    </Head>
  );
}
