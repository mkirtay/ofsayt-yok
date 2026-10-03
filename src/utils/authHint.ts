/**
 * Başlıktaki oturum düğmeleri alanının yeri oturum bilgisi gelmeden ayrılır (CLS).
 *
 * Ziyaretçide "Giriş Yap" + "Üye Ol" ≈ 197 px, oturum açıkken zil + avatar ≈ 88 px; yer tutucu 160 px'ti → oturum
 * gelince alan genişleyip başlığı yatayda kaydırıyordu (masaüstü CLS 0,0005–0,004). Varsayılan yer ziyaretçi
 * genişliği; son oturum açıktıysa (localStorage ipucu) boyamadan önce satır içi betik `<html data-auth-hint="in">`
 * yazar → yer oturum açık genişliği. İpucu yanlışsa (başka sekmede çıkış) yalnız o yüklemede bir kayma.
 */
export const AUTH_HINT_KEY = 'oy_auth_hint';
export const AUTH_HINT_ATTR = 'data-auth-hint';

export const AUTH_HINT_SCRIPT =
  "(function(){try{if(localStorage.getItem('" +
  AUTH_HINT_KEY +
  "')==='1')document.documentElement.setAttribute('" +
  AUTH_HINT_ATTR +
  "','in')}catch(e){}})()";

type HintStorage = Pick<Storage, 'setItem' | 'removeItem'>;
type HintRoot = { setAttribute(n: string, v: string): void; removeAttribute(n: string): void };

/** Oturum durumu netleşince ipucu güncellenir (yükleniyor iken dokunulmaz). */
export function writeAuthHint(status: 'loading' | 'authenticated' | 'unauthenticated', storage: HintStorage, root: HintRoot): void {
  if (status === 'loading') return;
  try {
    if (status === 'authenticated') {
      storage.setItem(AUTH_HINT_KEY, '1');
      root.setAttribute(AUTH_HINT_ATTR, 'in');
    } else {
      storage.removeItem(AUTH_HINT_KEY);
      root.removeAttribute(AUTH_HINT_ATTR);
    }
  } catch {
    // depolama kapalı (gizli mod): ipucu yok, varsayılan ziyaretçi genişliği
  }
}
