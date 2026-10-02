import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/kuralKosesi';
import { useMotionPause } from '@/hooks/useMotionPause';
import { loadFacts, localizeFact, type KuralFact } from './facts';
import { KURAL_KOSESI_OPEN_EVENT } from './openEvent';
import {
  PEEK_VISIBLE_MS,
  dailyIndex,
  getStorage,
  isDotHidden,
  markOpened,
  planPeek,
  readState,
  recordPeek,
  visitStartedAt,
  writeState,
} from './schedule';
import type { PanelProps } from './Panel';
import WhistleIcon from './WhistleIcon';
import { LAUNCHER_SIZE_PX, bubblePosition } from './launcherPosition';
import { useLauncherDrag } from './useLauncherDrag';
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

/**
 * Sağ alttaki düdük düğmesi, sarı "yeni" noktası ve "Biliyor muydun?" baloncuğu; paneli açar. Düğme dikeyde
 * sürüklenebilir (ok tuşlarıyla da); baloncuk onunla birlikte hareket eder (bkz. useLauncherDrag).
 */
export default function Launcher() {
  const { t } = useTranslation('kuralKosesi');
  const { locale } = useI18n();
  const launcherRef = useRef<HTMLButtonElement>(null);
  useMotionPause(launcherRef, { offscreen: false });

  // Bileşen yalnız istemcide (ssr:false) çizilir; ilk değerler doğrudan tarayıcıdan okunabilir.
  const [storage] = useState(getStorage);
  const [visitStart] = useState(() => visitStartedAt(Date.now()));
  const [seen, setSeen] = useState(() => isDotHidden(storage, Date.now()));
  const [facts, setFacts] = useState<KuralFact[] | null>(null);
  const [peekIndex, setPeekIndex] = useState<number | null>(null);
  const [Panel, setPanel] = useState<ComponentType<PanelProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [recheck, setRecheck] = useState(0);
  const drag = useLauncherDrag(launcherRef, storage);

  // Baloncuğu kurallara göre zamanla (depolama yoksa hiç). Panel açıkken ya da baloncuk görünürken bekler.
  useEffect(() => {
    if (!storage || open || peekIndex !== null) return;
    const at = planPeek(storage, Date.now(), visitStart);
    if (at === null) return;
    let cancelled = false;
    let removeVisibilityListener: (() => void) | null = null;
    const id = window.setTimeout(async () => {
      // Başka sekme bu arada göstermiş/paneli açmış olabilir: durumu yeniden oku.
      const due = planPeek(storage, Date.now(), visitStart);
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
    try {
      const [PanelComponent, list] = await Promise.all([loadPanel(), loadFacts()]);
      setPeekIndex(null);
      setPanel(() => PanelComponent);
      setFacts(list);
      setStartIndex(dailyIndex(Date.now(), list.length));
    } catch {
      return;
    }
    setOpen(true);
    setSeen(true);
    markOpened(storage, Date.now());
  }, [storage]);

  // Sayfanın başka bir yerinden açma isteği (bkz. openEvent.ts).
  useEffect(() => {
    const onOpenRequest = () => void openPanel();
    window.addEventListener(KURAL_KOSESI_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(KURAL_KOSESI_OPEN_EVENT, onOpenRequest);
  }, [openPanel]);

  const closePanel = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const peekFact = peekIndex !== null && facts?.[peekIndex] ? localizeFact(facts[peekIndex], locale) : null;
  // Baloncuk düğmeyle birlikte konumlanır (üst yarıda aşağı, alt yarıda yukarı açılır); sürüklerken gizli.
  const peekPosition =
    drag.top !== null && drag.viewportHeight !== null ? bubblePosition(drag.top, LAUNCHER_SIZE_PX, drag.viewportHeight) : null;

  return (
    <>
      {peekFact && !drag.dragging ? (
        <button
          type="button"
          className={styles.peek}
          data-side={drag.side}
          style={peekPosition ? { top: peekPosition.top ?? 'auto', bottom: peekPosition.bottom ?? 'auto' } : undefined}
          onClick={openPanel}
        >
          <small>{t('didYouKnow')}</small>
          <strong>{peekFact.title}</strong>
        </button>
      ) : null}
      <button
        ref={launcherRef}
        type="button"
        className={styles.launcher}
        style={{ transform: `translate(${drag.offsetX}px, ${drag.offset}px)` }}
        data-side={drag.side}
        data-dragging={drag.dragging || undefined}
        data-ready={drag.ready || undefined}
        aria-label={`${t('open')}. ${t(drag.side === 'left' ? 'sideLeft' : 'sideRight')}. ${t('moveHint')}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (drag.consumeDragClick()) return;
          void openPanel();
        }}
        {...drag.handlers}
        onPointerEnter={preload}
        onTouchStart={preload}
        onFocus={preload}
      >
        <WhistleIcon size={26} />
        {seen ? null : <span className={styles.dot} />}
      </button>
      {Panel && facts ? (
        <Panel open={open} side={drag.side} facts={facts} startIndex={startIndex} onClose={closePanel} />
      ) : null}
    </>
  );
}
