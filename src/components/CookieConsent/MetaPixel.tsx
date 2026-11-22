import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { CONSENT_EVENT, metaPixelId, readConsent, type AnalyticsConsent } from '@/lib/analyticsConsent';
import { REGISTRATION_EVENT, ensureFbqStub, flushRegistrationEvent, isSensitiveUrl } from '@/lib/metaPixel';

/** Bu sayfa ömründe `init` yapıldı mı (onay geri çekilip yeniden verilirse tekrar init yerine `consent grant`). */
let initedId: string | null = null;

/**
 * Meta Pixel — GoogleAnalytics.tsx ile aynı mantık: YALNIZ "Kabul et" sonrası yüklenir (onaysız ziyarette betik ve çerez
 * yok), `lazyOnload` (LCP/TBT'yi etkilemesin). `autoConfig` kapalı (otomatik düğme/meta olayları yok), geçmiş
 * değişiminde otomatik PageView kapalı; ilk yükte bir, sonra her routeChangeComplete'te bir PageView — adres hassassa
 * (ödeme, token / e-posta parametresi) o sayfada olay yok. Onay geri çekilirse `fbq('consent','revoke')`.
 */
export default function MetaPixel() {
  const id = metaPixelId();
  const router = useRouter();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const prev = useRef<AnalyticsConsent | null>(null);

  useEffect(() => {
    if (!id) return;
    setConsent(readConsent());
    const on = (e: Event) => setConsent(((e as CustomEvent).detail as AnalyticsConsent | null) ?? null);
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, [id]);

  useEffect(() => {
    const was = prev.current;
    prev.current = consent;
    if (!id) return;
    if (consent !== 'granted') {
      if (was === 'granted') window.fbq?.('consent', 'revoke');
      return;
    }
    const fbq = ensureFbqStub();
    if (initedId !== id) {
      fbq('set', 'autoConfig', false, id);
      fbq('init', id);
      initedId = id;
    } else {
      fbq('consent', 'grant');
    }
    const pageView = () => {
      if (!isSensitiveUrl(window.location.href)) fbq('track', 'PageView');
      flushRegistrationEvent({ granted: true, href: window.location.href, fbq });
    };
    const onRegistration = () => flushRegistrationEvent({ granted: true, href: window.location.href, fbq });
    pageView();
    router.events.on('routeChangeComplete', pageView);
    window.addEventListener(REGISTRATION_EVENT, onRegistration);
    return () => {
      router.events.off('routeChangeComplete', pageView);
      window.removeEventListener(REGISTRATION_EVENT, onRegistration);
    };
  }, [id, consent, router.events]);

  if (!id || consent !== 'granted') return null;
  return <Script id="meta-pixel-lib" src="https://connect.facebook.net/en_US/fbevents.js" strategy="lazyOnload" />;
}
