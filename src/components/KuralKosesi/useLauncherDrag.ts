import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import Router from 'next/router';
import {
  TOP_GAP_PX,
  isDragMovement,
  keyStep,
  offsetForTop,
  offsetFromRatio,
  readSavedRatio,
  saveRatio,
  type LauncherBounds,
} from './launcherPosition';

type DragSession = {
  pointerId: number;
  startY: number;
  startOffset: number;
  moved: boolean;
  latest: number;
  frame: number;
};

/**
 * Düğmenin transform'suz yeri (fixed → offsetTop görünüm alanına göre, transform'u saymaz) ve sınırlar. Üst sınır:
 * header + sayfanın yapışık üst alanı (`--sticky-top-extra`, ör. ana sayfada gün şeridi) + boşluk — logo bandı
 * kaydırmayla gizlense de düğme şeridin üstüne binmez.
 */
function measure(el: HTMLElement): LauncherBounds {
  const rootStyle = getComputedStyle(document.documentElement);
  const header = parseFloat(rootStyle.getPropertyValue('--header-height'));
  const extra = parseFloat(rootStyle.getPropertyValue('--sticky-top-extra'));
  return {
    defaultTop: el.offsetTop,
    minTop: (Number.isFinite(header) ? header : 64) + (Number.isFinite(extra) ? extra : 0) + TOP_GAP_PX,
    viewportHeight: window.innerHeight,
  };
}

/**
 * Kural Köşesi düğmesini yalnız dikey eksende sürükler (Pointer Events: fare + dokunma). Sürükleme sırasında
 * React çizimi yok: konum rAF'te doğrudan `transform`a yazılır, bırakınca state'e ve depolamaya geçer.
 * Bkz. launcherPosition.ts (sınırlar, eşik, oran).
 */
export function useLauncherDrag(ref: RefObject<HTMLButtonElement | null>, storage: Storage | null) {
  const [offset, setOffset] = useState(0);
  const [bounds, setBounds] = useState<LauncherBounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const offsetRef = useRef(0);
  const boundsRef = useRef<LauncherBounds | null>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  /** Depolama yoksa bu ziyaretteki oran (döndürmede korunur). */
  const ratioRef = useRef<number | null>(null);

  const commit = useCallback(
    (next: number) => {
      const b = boundsRef.current;
      offsetRef.current = next;
      setOffset(next);
      if (!b) return;
      ratioRef.current = (b.defaultTop + next) / b.viewportHeight;
      saveRatio(storage, b.defaultTop + next, b.viewportHeight);
    },
    [storage],
  );

  // İlk yer (kayıtlı oran) boyamadan önce; yeniden boyutlandırma / döndürmede sınırlar yeniden hesaplanır.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      if (session.current) return;
      const b = measure(el);
      boundsRef.current = b;
      const next = offsetFromRatio(readSavedRatio(storage) ?? ratioRef.current, b);
      offsetRef.current = next;
      setBounds(b);
      setOffset(next);
    };
    apply();
    // Geçişler ilk yerleşmeden sonra açılır (kayıtlı yere kayarak gelmesin).
    const frame = requestAnimationFrame(() => setReady(true));
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    // Sayfa geçişinde yapışık üst alan (gün şeridi) gelip gidebilir → üst sınır yeniden.
    Router.events.on('routeChangeComplete', apply);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      Router.events.off('routeChangeComplete', apply);
    };
  }, [ref, storage]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    suppressClick.current = false;
    session.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offsetRef.current,
      moved: false,
      latest: offsetRef.current,
      frame: 0,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Etkin olmayan pointer (ör. sentetik olay): yakalama olmadan da düğme üstünde çalışır.
    }
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const s = session.current;
    const b = boundsRef.current;
    if (!s || !b || event.pointerId !== s.pointerId) return;
    const dy = event.clientY - s.startY;
    if (!s.moved) {
      if (!isDragMovement(dy)) return;
      s.moved = true;
      setDragging(true);
    }
    s.latest = offsetForTop(b.defaultTop + s.startOffset + dy, b);
    if (!s.frame) {
      const el = event.currentTarget;
      s.frame = requestAnimationFrame(() => {
        s.frame = 0;
        el.style.transform = `translateY(${s.latest}px)`;
      });
    }
  }, []);

  const endDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const s = session.current;
      if (!s || event.pointerId !== s.pointerId) return;
      session.current = null;
      if (s.frame) cancelAnimationFrame(s.frame);
      if (!s.moved) return; // dokunuş → click paneli açar
      suppressClick.current = true;
      event.currentTarget.style.transform = `translateY(${s.latest}px)`;
      setDragging(false);
      commit(s.latest);
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const step = keyStep(event.key);
      const b = boundsRef.current;
      if (step === null || !b) return;
      event.preventDefault();
      commit(offsetForTop(b.defaultTop + offsetRef.current + step, b));
    },
    [commit],
  );

  /** Sürüklemenin ardından gelen click'i yutar (panel açılmaz). */
  const consumeDragClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return {
    offset,
    /** Düğmenin şu anki üst kenarı (baloncuk için); ölçülmeden önce null. */
    top: bounds ? bounds.defaultTop + offset : null,
    viewportHeight: bounds?.viewportHeight ?? null,
    dragging,
    ready,
    consumeDragClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onKeyDown },
  };
}
