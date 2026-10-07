/**
 * Frikik ürün olayları (Vercel Web Analytics `track`). Yalnız sayısal / sabit listeli alanlar taşınır: e-posta, ad,
 * kullanıcı kimliği ya da takma ad ASLA gönderilmez (kişisel veri yok; `_app` beforeSend temizliği adres içindir).
 * `track` tarayıcı dışında / analitik yokken sessizce boşa düşer.
 */
import { track } from '@vercel/analytics';

export type FrikikEntry = 'home_card' | 'menu' | 'match_cta' | 'share_link' | 'direct';

type Events = {
  frikik_started: { entry: FrikikEntry; again: boolean };
  frikik_finished: { level: number; score: number; signedIn: boolean };
  frikik_shared: { level: number; method: 'share' | 'clipboard' };
  frikik_login_prompt_shown: { level: number };
  frikik_login_from_game: { level: number };
  frikik_card_click: { entry: FrikikEntry };
};

export function trackFrikik<K extends keyof Events>(event: K, props: Events[K]): void {
  try {
    track(event, props);
  } catch {
    // analitik yok / engellenmiş: oyun etkilenmez
  }
}

/** `/frikik?src=…` giriş noktası etiketi (yalnız bilinen değerler; başka her şey "direct"). */
export function entryFromQuery(raw: unknown): FrikikEntry {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'home_card' || v === 'menu' || v === 'match_cta' ? v : 'direct';
}
