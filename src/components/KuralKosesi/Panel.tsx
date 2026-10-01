import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/kuralKosesi';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';
import FormationScene from '@/components/PitchScenes/FormationScene';
import MatchScene from '@/components/PitchScenes/MatchScene';
import RingScene from '@/components/PitchScenes/RingScene';
import ScaledScene from '@/components/PitchScenes/ScaledScene';
import VarScene from '@/components/PitchScenes/VarScene';
import { localizeFact, type KuralFact, type LocalizedFact } from './facts';
import WhistleIcon from './WhistleIcon';
import styles from './panel.module.scss';

export type PanelProps = {
  open: boolean;
  facts: KuralFact[];
  /** Panel her açılışta bu bilgiyle (günün bilgisi) başlar. */
  startIndex: number;
  onClose: () => void;
};

/** Kapanış kayması (panel.module.scss transition ile aynı); sahne bu süre sonunda kaldırılır. */
const CLOSE_MS = 300;

function Scene({ fact }: { fact: LocalizedFact }) {
  switch (fact.animation) {
    case '02-dizilis':
      return <FormationScene />;
    case '03-var-ofsayt-yok':
      return <VarScene />;
    case '08-mac-baslamadi':
      return <RingScene label={fact.sceneLabel} />;
    case '01-mac-oynaniyor':
    case '06-gol-ani':
    default:
      return <MatchScene />;
  }
}

function useIsMobileLayout(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_LAYOUT_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Kural Köşesi paneli (09-kural-kosesi.html). Sağdan kayar; mobilde karartmalı ve modal (odak içeride),
 * masaüstünde header'ın altında, karartmasız ve modal değil. Sahne yalnız panel açıkken çizilir.
 */
export default function Panel({ open, facts, startIndex, onClose }: PanelProps) {
  const { t } = useTranslation('kuralKosesi');
  const { locale } = useI18n();
  const isMobile = useIsMobileLayout();
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [index, setIndex] = useState(startIndex);
  // `shown`: CSS açık sınıfı (bir kare gecikmeli → ilk açılışta da kayarak gelir). `sceneOn`: sahne çizili mi.
  const [shown, setShown] = useState(false);
  const [sceneOn, setSceneOn] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // Açılış/kapanış geçişi render sırasında: açılışta günün bilgisine dön ve sahneyi çiz, kapanışta kaydır.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIndex(startIndex);
      setSceneOn(true);
    } else {
      setShown(false);
    }
  }

  useEffect(() => {
    if (open) {
      let raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setShown(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    const id = window.setTimeout(() => setSceneOn(false), CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  // Açılınca odak panele (kapatma düğmesi); kapanınca düğmeye dönüşü Launcher yapar.
  useEffect(() => {
    if (shown) closeRef.current?.focus();
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  // Mobilde modal: Tab odağı panelin içinde döner.
  const onDrawerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!isMobile || event.key !== 'Tab' || !drawerRef.current) return;
      const items = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isMobile],
  );

  const total = facts.length;
  const safeIndex = Math.min(index, total - 1);
  const fact = localizeFact(facts[safeIndex], locale);
  const go = (delta: number) => setIndex((i) => (i + delta + total) % total);

  return (
    <>
      <div className={`${styles.backdrop} ${shown ? styles.backdropOpen : ''}`} onClick={onClose} aria-hidden="true" />
      <aside
        ref={drawerRef}
        className={`${styles.drawer} ${shown ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-modal={isMobile ? true : undefined}
        aria-labelledby={titleId}
        onKeyDown={onDrawerKeyDown}
      >
        <div className={styles.head}>
          <span className={styles.badge}>
            <WhistleIcon size={20} />
          </span>
          <div className={styles.titles}>
            <strong id={titleId}>{t('title')}</strong>
            <span>{t('counter', { current: safeIndex + 1, total })}</span>
          </div>
          <button ref={closeRef} type="button" className={styles.close} aria-label={t('close')} onClick={onClose}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div ref={bodyRef} className={styles.body}>
          <ScaledScene>{sceneOn ? <Scene key={safeIndex} fact={fact} /> : null}</ScaledScene>
          <h2 className={styles.fact} aria-live="polite">
            {fact.title}
          </h2>
          <p className={styles.text}>{fact.body}</p>
          {fact.note ? (
            <div className={styles.note}>
              <small>{t('didYouKnow')}</small>
              <span>{fact.note}</span>
            </div>
          ) : null}
        </div>
        <div className={styles.foot}>
          <button type="button" className={styles.btn} onClick={() => go(-1)}>
            ‹ {t('prev')}
          </button>
          <div className={styles.dots} aria-hidden="true">
            {facts.map((f, i) => (
              <span key={f.id} className={`${styles.pip} ${i === safeIndex ? styles.pipOn : ''}`} />
            ))}
          </div>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => go(1)}>
            {t('next')} ›
          </button>
        </div>
      </aside>
    </>
  );
}
