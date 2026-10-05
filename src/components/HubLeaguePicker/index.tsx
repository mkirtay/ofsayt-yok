import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';
import LeagueLogo from '@/components/LeagueLogo';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';
import styles from './hubLeaguePicker.module.scss';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export type HubLeaguePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueName: string;
  logoSrc: string | null;
  logoBackdrop?: boolean;
  /** Açıkken gösterilen liste (HubLeagueList). */
  children: ReactNode;
};

/**
 * Yan panelin üstündeki lig seçici: seçili ligin logosu + adı + ▾. Basınca lig listesi açılır — masaüstünde panelin
 * içinde, mobilde (< 1024 px) tam ekran sheet (aynı DOM, yerleşimi CSS seçer). Esc kapatır; mobilde odak kapat
 * düğmesiyle başlar, sheet içinde döner ve sayfa kaydırması kilitlenir; kapanınca odak düğmeye döner.
 */
export default function HubLeaguePicker({ open, onOpenChange, leagueName, logoSrc, logoBackdrop, children }: HubLeaguePickerProps) {
  const { t } = useTranslation('match');
  const sheetId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  // Kapanınca odak düğmeye (odak sheet içindeyse — başka yere tıklanınca odak çalınmaz).
  useEffect(() => {
    if (wasOpen.current && !open && (document.activeElement == null || document.activeElement === document.body)) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Mobil sheet: açılınca odak kapat düğmesine (arama kutusuna değil — klavye açılıp listeyi örtmesin).
  useEffect(() => {
    if (!open || !window.matchMedia(MOBILE_LAYOUT_QUERY).matches) return;
    sheetRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  // Mobil sheet açıkken arka sayfa kaymasın.
  useEffect(() => {
    if (!open || !window.matchMedia(MOBILE_LAYOUT_QUERY).matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    // Mobil (modal): Tab sheet içinde döner.
    if (e.key !== 'Tab' || !window.matchMedia(MOBILE_LAYOUT_QUERY).matches || !sheetRef.current) return;
    const items = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.picker}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        aria-label={t('hub.leaguePickerOpen', { league: leagueName })}
        onClick={() => onOpenChange(!open)}
      >
        <LeagueLogo src={logoSrc} size={22} className={`${styles.logo} ${logoBackdrop ? styles.logoBackdrop : ''}`.trim()} />
        <span className={styles.name}>{leagueName}</span>
        <span className={styles.chevron} data-open={open || undefined} aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div id={sheetId} ref={sheetRef} className={styles.sheet} role="dialog" aria-label={t('hub.leaguePickerTitle')} onKeyDown={onKeyDown}>
          <div className={styles.sheetHeader}>
            <h2 className={styles.sheetTitle}>{t('hub.leaguePickerTitle')}</h2>
            <button type="button" className={styles.close} onClick={close} aria-label={t('hub.leaguePickerClose')}>
              ✕
            </button>
          </div>
          <div className={styles.sheetBody}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}
