/**
 * Meta Pixel yardımcıları (bileşen: components/CookieConsent/MetaPixel.tsx). Yalnız açık onayla çalışır; kişisel veri
 * (e-posta, ad, telefon, kullanıcı kimliği) hiçbir olayda gönderilmez — "advanced matching" kullanılmıyor.
 */
import { metaPixelId } from '@/lib/analyticsConsent';
import { scrubAnalyticsUrl } from '@/lib/analyticsScrub';

export type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * Adreste ödeme / belirteç / e-posta parametresi varsa (scrubAnalyticsUrl bir şey sildiyse) o sayfada Meta'ya olay
 * gitmez: Pixel adresi (`dl`) kendisi okur, GA'daki gibi temizlenmiş adres veremeyiz.
 */
export function isSensitiveUrl(href: string): boolean {
  return scrubAnalyticsUrl(href) !== href;
}

/**
 * Standart fbq yer tutucusu (betik `lazyOnload` ile gelene kadar çağrılar kuyrukta bekler). `disablePushState`:
 * fbevents.js geçmiş (pushState) değişiminde kendiliğinden PageView atmasın — sayfa değişimini elle, adres kontrolüyle
 * gönderiyoruz (yoksa çift sayım + hassas adreste olay).
 */
export function ensureFbqStub(w: Window = window): Fbq {
  if (w.fbq) return w.fbq;
  const n = function fbq(...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue!.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  n.disablePushState = true;
  w.fbq = n;
  if (!w._fbq) w._fbq = n;
  return n;
}

const REG_KEY = 'scor3:meta-registration';
export const REGISTRATION_EVENT = 'scor3:registration-complete';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function sessionStore(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Yeni hesap açıldı (e-posta kaydı başarılı ya da Google ile ilk giriş): oturumda bir kez CompleteRegistration bekler. */
export function markRegistrationCompleted(storage: StorageLike | null = sessionStore()): void {
  try {
    if (!storage || storage.getItem(REG_KEY)) return;
    storage.setItem(REG_KEY, 'pending');
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new Event(REGISTRATION_EVENT));
  } catch {
    // yok say
  }
}

/**
 * Bekleyen kayıt olayını gönderir — yalnız Pixel tanımlı, onay verilmiş ve adres hassas değilken; oturum başına bir kez.
 * Koşul sağlanmazsa olay bekler (ör. kayıttan sonra ?email= içeren doğrulama sayfası → sonraki sayfada gider).
 */
export function flushRegistrationEvent(opts: {
  granted: boolean;
  href: string;
  fbq: Fbq | undefined;
  storage?: StorageLike | null;
}): boolean {
  const storage = opts.storage === undefined ? sessionStore() : opts.storage;
  try {
    if (!opts.granted || !opts.fbq || !metaPixelId() || !storage) return false;
    if (storage.getItem(REG_KEY) !== 'pending' || isSensitiveUrl(opts.href)) return false;
    storage.setItem(REG_KEY, 'sent');
    opts.fbq('track', 'CompleteRegistration');
    return true;
  } catch {
    return false;
  }
}
