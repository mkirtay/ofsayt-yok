/**
 * İlk ziyaret tanıtımı: hangi kart/ipucunun görüldüğü bu cihazda (localStorage) tutulur — giriş yapmış kullanıcıda da
 * aynı. Depolama yoksa / hata verirse hiçbir şey gösterilmez (kapatma kalıcı olamaz; her sayfada çıkan kart olmasın).
 *
 * Bu dosya ana sayfanın ilk yüküne girer: küçük ve bağımlılıksız kalmalı. Baloncuk katmanı ayrı parçada (`hintLayer`).
 */

export const ONBOARD_KEYS = {
  /** Ana sayfadaki karşılama kartı. */
  welcome: 'scor3.onboard.welcome',
  /** Maç sayfası: AI Analiz sekmesi ipucu. */
  aiTab: 'scor3.onboard.aiTab',
  /** Mobil: sağ alttaki ✦ asistan + Kural Köşesi düğmelerinin etiketleri. */
  fabs: 'scor3.onboard.fabs',
  /** İlk yıldızlama: "Favoriler sekmesinde". */
  favorite: 'scor3.onboard.favorite',
} as const;

export type OnboardKey = keyof typeof ONBOARD_KEYS;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Görüldü mü? Depolama okunamıyorsa `true` (gösterme). */
export function isOnboardSeen(key: OnboardKey, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(ONBOARD_KEYS[key]) != null;
  } catch {
    return true;
  }
}

export function markOnboardSeen(key: OnboardKey, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(ONBOARD_KEYS[key], String(Date.now()));
  } catch {}
}

/** İlk ziyaret oturumu işaretleri (bkz. `isIntroPending`). */
export const FIRST_VISIT_KEY = 'scor3.onboard.firstVisit';
export const INTRO_SESSION_KEY = 'scor3.onboard.introSession';
/** Karşılama kartı kapatılınca (tanıtım bitti) yayınlanır — ertelenen üye ol kartı vb. dinler. */
export const INTRO_DONE_EVENT = 'scor3:onboard-intro-done';

function defaultSessionStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * İlk ziyaretin tanıtımı sürüyor mu: karşılama kartı kapatılmadı VE bu, ilk ziyaretin tarayıcı oturumu. Sonraki
 * ziyarette (yeni oturum) ya da kart kapatılınca `false`. Depolama yoksa `false` (başka şeyleri bekletmesin).
 * İlk çağrı ilk ziyareti işaretler.
 */
export function isIntroPending(
  storage: StorageLike | null = defaultStorage(),
  session: StorageLike | null = defaultSessionStorage(),
  now = Date.now(),
): boolean {
  if (!storage || !session) return false;
  try {
    if (storage.getItem(ONBOARD_KEYS.welcome) != null) return false;
    if (storage.getItem(FIRST_VISIT_KEY) == null) {
      storage.setItem(FIRST_VISIT_KEY, String(now));
      session.setItem(INTRO_SESSION_KEY, '1');
      return true;
    }
    return session.getItem(INTRO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Karşılama kartı sunucu HTML'inde hep var ama gizli; boyamadan önce çalışan satır içi betik ilk ziyarette
 * `<html data-onboard-welcome>` yazar → CSS kartı baştan gösterir (hydration'da araya girme / kayma yok).
 */
export const WELCOME_ATTR = 'data-onboard-welcome';

/** Satır içi betik — `isOnboardSeen('welcome')` ile aynı kural (bağımlılıksız, ES5). */
export const WELCOME_BOOT_SCRIPT =
  "(function(){try{if(location.pathname==='/'&&localStorage.getItem('" +
  ONBOARD_KEYS.welcome +
  "')==null)document.documentElement.setAttribute('" +
  WELCOME_ATTR +
  "','')}catch(e){}})()";

/** Karşılama kartı şu an ekranda mı (başka ipuçları onunla aynı anda çıkmasın). */
export function isWelcomeShowing(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(WELCOME_ATTR);
}

/** `[data-onboard=…]` bağlantı noktaları (bileşenlerde aynı adlar). */
export const ONBOARD_ANCHORS = {
  matchRow: '[data-onboard="match-row"]',
  favStar: '[data-onboard="fav-star"]',
  gundem: 'a[href="/gundem"]',
  assistantFab: '[data-onboard="assistant-fab"]',
  rulesFab: '[data-onboard="rules-fab"]',
  favoritesTab: '[data-tab="favorites"], [data-nav-key="favorites"]',
} as const;
