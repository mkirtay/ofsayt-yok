import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONSENT_EVENT, anyTrackerConfigured, clearTrackerCookies, readConsent, writeConsent } from '@/lib/analyticsConsent';
import CookieIcon from '@/components/icons/CookieIcon';
import styles from './cookieConsent.module.scss';

/** Band açıkken `<html>` üzerinde: sol alttaki üyelik kartı gizlenir (iki istem üst üste binmesin). */
const OPEN_ATTR = 'data-consent-open';

/**
 * Analitik / reklam ölçümü çerez onay bandı (GA4 + Meta Pixel, tek onay): yalnız en az biri tanımlıyken ve tercih yokken (istemcide, ilk çizimden sonra — SSR
 * HTML'inde yok, düzeni itmez: sabit konum). "Reddet" ile "Kabul et" eşit ağırlıkta (KVKK: rıza serbest olmalı).
 */
export default function CookieConsent() {
  const id = anyTrackerConfigured();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setOpen(readConsent() == null);
    const on = (e: Event) => setOpen((e as CustomEvent).detail == null);
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute(OPEN_ATTR, '');
    return () => root.removeAttribute(OPEN_ATTR);
  }, [open]);

  if (!id || !open) return null;
  return (
    <div
      className={styles.banner}
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
    >
      <div className={styles.head}>
        <span className={styles.icon}>
          <CookieIcon size={18} />
        </span>
        <div className={styles.copy}>
          <h2 id="cookie-consent-title" className={styles.title}>
            Çerez tercihi
          </h2>
          <p id="cookie-consent-desc" className={styles.text}>
            Siteyi geliştirmek ve reklamlarımızın etkisini ölçmek için Google Analytics ve Meta (Facebook/Instagram) çerezlerini kullanıyoruz.{' '}
            <Link href="/cerez-politikasi" className={styles.link}>
              Çerez Politikası
            </Link>
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => {
            clearTrackerCookies();
            writeConsent('denied');
          }}
        >
          Reddet
        </button>
        <button type="button" className={styles.btnPrimary} onClick={() => writeConsent('granted')}>
          Kabul et
        </button>
      </div>
    </div>
  );
}

/** Footer "Çerez tercihleri": tercihi siler, GA + Meta çerezlerini temizler, bandı yeniden açar. */
export function CookiePreferencesLink({ className, label }: { className?: string; label: string }) {
  if (!anyTrackerConfigured()) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        clearTrackerCookies();
        writeConsent(null);
      }}
    >
      {label}
    </button>
  );
}
