import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONSENT_EVENT, clearGaCookies, gaMeasurementId, readConsent, writeConsent } from '@/lib/analyticsConsent';
import styles from './cookieConsent.module.scss';

/**
 * Analitik çerez onay bandı: yalnız GA ölçüm kimliği tanımlıyken ve tercih yokken (istemcide, ilk çizimden sonra — SSR
 * HTML'inde yok, düzeni itmez: sabit konum). "Reddet" ile "Kabul et" eşit ağırlıkta (KVKK: rıza serbest olmalı).
 */
export default function CookieConsent() {
  const id = gaMeasurementId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setOpen(readConsent() == null);
    const on = (e: Event) => setOpen((e as CustomEvent).detail == null);
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, [id]);

  if (!id || !open) return null;
  return (
    <div className={styles.banner} role="dialog" aria-live="polite" aria-label="Çerez tercihi">
      <p className={styles.text}>
        Siteyi geliştirmek için ziyaret istatistiklerini Google Analytics ile ölçmek istiyoruz (analitik çerezler). İzin
        vermezsen yalnız zorunlu çerezler kullanılır. <Link href="/cerez-politikasi">Çerez Politikası</Link>
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            clearGaCookies();
            writeConsent('denied');
          }}
        >
          Reddet
        </button>
        <button type="button" className={styles.btn} onClick={() => writeConsent('granted')}>
          Kabul et
        </button>
      </div>
    </div>
  );
}

/** Footer "Çerez tercihleri": tercihi siler, GA çerezlerini temizler, bandı yeniden açar. */
export function CookiePreferencesLink({ className, label }: { className?: string; label: string }) {
  if (!gaMeasurementId()) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        clearGaCookies();
        writeConsent(null);
      }}
    >
      {label}
    </button>
  );
}
