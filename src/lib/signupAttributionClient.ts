/**
 * Tarayıcı tarafı: oturumun ilk giriş kaynağını `sessionStorage`'da tutar ve kayıtta bir kez gönderir.
 * sessionStorage sekme/oturum kapanınca silinir; kalıcı çerez yok. Depolama kapalıysa (gizli mod vb.)
 * sessizce hiçbir şey yapmaz.
 */
import { cleanUtmValue, type SignupAttributionPayload } from '@/utils/signupAttribution';

const KEY = 'oy:signup-attribution';
const SENT_KEY = 'oy:signup-attribution-sent';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function sessionStore(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Her tam sayfa yüklemesinde çağrılır (bkz. SignupAttributionSync).
 * - `firstTouchAt`: oturumun ilk girişi — bir kez yazılır, değişmez.
 * - utm alanları: oturumdaki İLK utm'li girişten dolar (önce utm'siz girip sonra kampanya linkine
 *   tıklayan da ölçülür); bir kez dolunca sonradan gelen utm öncekini ezmez.
 */
export function captureSessionAttribution(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  storage: StorageLike | null = sessionStore(),
  now: Date = new Date(),
): void {
  try {
    if (!storage) return;
    const p = new URLSearchParams(search);
    const utm = {
      source: cleanUtmValue(p.get('utm_source')),
      medium: cleanUtmValue(p.get('utm_medium')),
      campaign: cleanUtmValue(p.get('utm_campaign')),
    };
    const hasUtm = Boolean(utm.source || utm.medium || utm.campaign);
    const existing = readSessionAttribution(storage);

    if (!existing) {
      storage.setItem(KEY, JSON.stringify({ ...utm, firstTouchAt: now.toISOString() } satisfies SignupAttributionPayload));
      return;
    }
    const existingHasUtm = Boolean(existing.source || existing.medium || existing.campaign);
    if (hasUtm && !existingHasUtm) {
      storage.setItem(KEY, JSON.stringify({ ...utm, firstTouchAt: existing.firstTouchAt } satisfies SignupAttributionPayload));
    }
  } catch {
    // depolama dolu/engelli — ölçüm olmadan devam
  }
}

export function readSessionAttribution(storage: StorageLike | null = sessionStore()): SignupAttributionPayload | null {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as SignupAttributionPayload) : null;
  } catch {
    return null;
  }
}

/** E-posta kaydında kaynak kayıt isteğiyle gittiyse oturum sonrası ayrıca gönderilmesin. */
export function markSessionAttributionSent(storage: StorageLike | null = sessionStore()): void {
  try {
    storage?.setItem(SENT_KEY, '1');
  } catch {
    // yok say
  }
}

/**
 * Oturum açıldıktan sonra bir kez: Google ile kayıtta hesap NextAuth tarafından oluşturulduğu için kaynak
 * buradan yazılır. Sunucu yalnızca yeni (son 24 sa) ve kaynağı boş hesaplara yazar; diğerlerinde no-op.
 */
export async function sendSessionAttributionOnce(
  storage: StorageLike | null = sessionStore(),
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    if (!storage || storage.getItem(SENT_KEY)) return;
    const payload = readSessionAttribution(storage);
    if (!payload) return;
    storage.setItem(SENT_KEY, '1');
    await fetchImpl('/api/user/attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ağ hatası — ölçüm olmadan devam
  }
}
