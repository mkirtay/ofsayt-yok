import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { CONSENT_EVENT, gaMeasurementId, readConsent, type AnalyticsConsent } from '@/lib/analyticsConsent';
import { scrubAnalyticsUrl } from '@/lib/analyticsScrub';
import { flushPendingWebVitals } from '@/lib/webVitals';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Google Analytics 4 — YALNIZ "Kabul et" sonrası yüklenir (onaysız ziyarette betik ve çerez yok). Sayfa görüntülemesi
 * elle gönderilir (`send_page_view: false`): adres `scrubAnalyticsUrl` ile temizlenir (/odeme sorgusu, e-posta / token
 * parametreleri gitmez). GA yönetiminde Gelişmiş ölçüm → "tarayıcı geçmişi olaylarına göre sayfa değişiklikleri"
 * KAPATILMALI (yoksa çift sayım + temizlenmemiş adres). `lazyOnload`: ilk yükleme ölçümlerini (LCP/TBT) etkilemesin.
 */
export default function GoogleAnalytics() {
  const id = gaMeasurementId();
  const router = useRouter();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);

  useEffect(() => {
    if (!id) return;
    setConsent(readConsent());
    const on = (e: Event) => setConsent(((e as CustomEvent).detail as AnalyticsConsent | null) ?? null);
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, [id]);

  useEffect(() => {
    if (!id || consent !== 'granted') return;
    // gtag yer tutucusu: kütüphane (lazyOnload) gelene kadar çağrılar dataLayer kuyruğunda bekler.
    if (!window.gtag) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params -- gtag sözleşmesi `arguments` nesnesini bekler
        window.dataLayer!.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', id, { send_page_view: false });
    }
    const send = () => {
      window.gtag?.('event', 'page_view', {
        page_location: scrubAnalyticsUrl(window.location.href),
        page_title: document.title,
      });
    };
    send();
    // GA kurulmadan ölçülen Web Vitals (TTFB / FCP) — sayfa görüntülemesinden sonra.
    flushPendingWebVitals();
    router.events.on('routeChangeComplete', send);
    return () => router.events.off('routeChangeComplete', send);
  }, [id, consent, router.events]);

  if (!id || consent !== 'granted') return null;
  return (
<Script id="ga-lib" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="lazyOnload" />
  );
}
