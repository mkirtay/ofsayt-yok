import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';

/**
 * Cloudflare Turnstile kutusu (kayıt + /hesap-silme talep formu). Betik yalnız bu hook'u kullanan sayfada ve yalnız
 * site anahtarı varsa yüklenir; kutu `containerRef`'e çizilir (yerini çağıran ayırır: 300×65 → `min-height: 70px`).
 * `required`: üretimde ve anahtar tanımlıysa — sunucu da üretimde zorunlu tutar (lib/security.ts → checkTurnstileGate).
 * `deferUntilActivated`: betik `activate()` çağrılana dek (ör. e-posta alanına odaklanınca) yüklenmez — sayfanın ilk
 * yükü üçüncü taraf betik taşımaz (/hesap-silme).
 */
export function useTurnstile({ deferUntilActivated = false }: { deferUntilActivated?: boolean } = {}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const required = process.env.NODE_ENV === 'production' && Boolean(siteKey);
  const [token, setToken] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [active, setActive] = useState(!deferUntilActivated);
  const activate = useCallback(() => setActive(true), []);

  useEffect(() => {
    if (!siteKey || !active) return;
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }

    const mount = () => {
      if (!window.turnstile) return;
      const el = containerRef.current;
      if (!el || el.childNodes.length > 0) return;
      widgetId.current = window.turnstile.render(el, {
        sitekey: siteKey,
        callback: (t) => setToken(t),
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      });
    };

    const timer = window.setInterval(mount, 300);
    return () => window.clearInterval(timer);
  }, [siteKey, active]);

  /** Gönderimden sonra (başarısız ya da tek kullanımlık belirteç harcandı): yeni belirteç iste. */
  const reset = useCallback(() => {
    if (window.turnstile) window.turnstile.reset(widgetId.current);
    setToken('');
  }, []);

  return { required, token, reset, containerRef, activate };
}
