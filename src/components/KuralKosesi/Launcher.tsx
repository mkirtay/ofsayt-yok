import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/kuralKosesi';
import { useMotionPause } from '@/hooks/useMotionPause';
import { loadFacts, localizeFact, type KuralFact } from './facts';
import {
  PEEK_VISIBLE_MS,
  dailyIndex,
  getStorage,
  isSeenToday,
  nextPeekAt,
  readState,
  recordOpen,
  recordPeek,
  visitStartedAt,
  writeState,
} from './schedule';
import type { PanelProps } from './Panel';
import WhistleIcon from './WhistleIcon';
import styles from './launcher.module.scss';

let panelLoad: Promise<ComponentType<PanelProps>> | null = null;
/** Panel + sahneler tek chunk; üzerine gelince/dokununca önceden, en geç ilk tıklamada. */
function loadPanel(): Promise<ComponentType<PanelProps>> {
  panelLoad ??= import('./Panel').then(
    (mod) => mod.default,
    (error) => {
      panelLoad = null;
      throw error;
    },
  );
  return panelLoad;
}

function preload() {
  void loadPanel().catch(() => {});
  void loadFacts().catch(() => {});
}

/** Sağ alttaki düdük düğmesi, sarı "yeni" noktası ve "Biliyor muydun?" baloncuğu; paneli açar. */
export default function Launcher() {
  const { t } = useTranslation('kuralKosesi');
  const { locale } = useI18n();
  const launcherRef = useRef<HTMLButtonElement>(null);
  useMotionPause(launcherRef, { offscreen: false });

  // Bileşen yalnız istemcide (ssr:false) çizilir; ilk değerler doğrudan tarayıcıdan okunabilir.
  const [storage] = useState(getStorage);
  const [visitStart] = useState(() => visitStartedAt(Date.now()));
  const [seen, setSeen] = useState(() => !storage || isSeenToday(readState(storage), Date.now()));
  const [facts, setFacts] = useState<KuralFact[] | null>(null);
  const [peekIndex, setPeekIndex] = useState<number | null>(null);
  const [Panel, setPanel] = useState<ComponentType<PanelProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [recheck, setRecheck] = useState(0);

  // Baloncuğu kurallara göre zamanla (depolama yoksa hiç). Panel açıkken ya da baloncuk görünürken bekler.
  useEffect(() => {
    if (!storage || open || peekIndex !== null) return;
    const at = nextPeekAt(readState(storage), Date.now(), visitStart);
    if (at === null) return;
    let cancelled = false;
    let removeVisibilityListener: (() => void) | null = null;
    const id = window.setTimeout(async () => {
      // Başka sekme bu arada göstermiş/paneli açmış olabilir: durumu yeniden oku.
      const due = nextPeekAt(readState(storage), Date.now(), visitStart);
      if (due === null) return;
      if (due > Date.now()) {
        setRecheck((n) => n + 1);
        return;
      }
      // Arka plandaki sekmede kimse görmez; günlük hakkı harcamadan sekme öne gelince yeniden dene.
      if (document.visibilityState === 'hidden') {
        const onVisible = () => {
          if (document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', onVisible);
          setRecheck((n) => n + 1);
        };
        document.addEventListener('visibilitychange', onVisible);
        removeVisibilityListener = () => document.removeEventListener('visibilitychange', onVisible);
        return;
      }
      try {
        const list = await loadFacts();
        if (cancelled) return;
        writeState(storage, recordPeek(readState(storage), Date.now()));
        setFacts(list);
        setPeekIndex(dailyIndex(Date.now(), list.length));
      } catch {
        // İçerik yüklenemedi: bu sefer baloncuk yok.
      }
    }, Math.max(0, at - Date.now()));
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      removeVisibilityListener?.();
    };
  }, [storage, open, peekIndex, visitStart, recheck]);

  useEffect(() => {
    if (peekIndex === null) return;
    const id = window.setTimeout(() => setPeekIndex(null), PEEK_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [peekIndex]);

  const openPanel = useCallback(async () => {
    setPeekIndex(null);
    try {
      const [PanelComponent, list] = await Promise.all([loadPanel(), loadFacts()]);
      setPanel(() => PanelComponent);
      setFacts(list);
      setStartIndex(dailyIndex(Date.now(), list.length));
    } catch {
      return;
    }
    setOpen(true);
    setSeen(true);
    if (storage) writeState(storage, recordOpen(readState(storage), Date.now()));
  }, [storage]);

  const closePanel = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const peekFact = peekIndex !== null && facts?.[peekIndex] ? localizeFact(facts[peekIndex], locale) : null;

  return (
    <>
      {peekFact ? (
        <button type="button" className={styles.peek} onClick={openPanel}>
          <small>{t('didYouKnow')}</small>
          <strong>{peekFact.title}</strong>
        </button>
      ) : null}
      <button
        ref={launcherRef}
        type="button"
        className={styles.launcher}
        aria-label={t('open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPanel}
        onPointerEnter={preload}
        onTouchStart={preload}
        onFocus={preload}
      >
        <WhistleIcon size={26} />
        {seen ? null : <span className={styles.dot} />}
      </button>
      {Panel && facts ? (
        <Panel open={open} facts={facts} startIndex={startIndex} onClose={closePanel} />
      ) : null}
    </>
  );
}
