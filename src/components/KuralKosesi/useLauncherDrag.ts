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
  clampOffsetX,
  isDragMovement,
  keySide,
  keyStep,
  offsetForTop,
  offsetFromRatio,
  offsetXForSide,
  readSavedPosition,
  releaseVelocityX,
  savePosition,
  snapSide,
  type LauncherBounds,
  type LauncherSide,
  type PointerSample,
} from './launcherPosition';

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  moved: boolean;
  latestX: number;
  latestY: number;
  samples: PointerSample[];
  frame: number;
};

const translate = (x: number, y: number) => `translate(${x}px, ${y}px)`;

/**
 * Düğmenin transform'suz yeri (fixed → offsetTop / offsetLeft görünüm alanına göre, transform'u saymaz) ve sınırlar.
 * Üst sınır: header + sayfanın yapışık üst alanı (`--sticky-top-extra`, ör. ana sayfada gün şeridi) + boşluk.
 * Genişlik `clientWidth` (kaydırma çubuğu hariç — fixed `right` da ona göre).
 */
function measure(el: HTMLElement): LauncherBounds {
  const rootStyle = getComputedStyle(document.documentElement);
  const header = parseFloat(rootStyle.getPropertyValue('--header-height'));
  const extra = parseFloat(rootStyle.getPropertyValue('--sticky-top-extra'));
  return {
    defaultTop: el.offsetTop,
    minTop: (Number.isFinite(header) ? header : 64) + (Number.isFinite(extra) ? extra : 0) + TOP_GAP_PX,
    viewportHeight: window.innerHeight,
    defaultLeft: el.offsetLeft,
    viewportWidth: document.documentElement.clientWidth,
    size: el.offsetWidth,
  };
}

/**
 * Kural Köşesi düğmesini sürükler (Pointer Events: fare + dokunma). Sürüklerken iki eksende serbest; bırakınca x en
 * yakın kenara (fırlatmada fırlatma yönüne) yapışır, y sınır içinde kalır. Sürükleme sırasında React çizimi yok:
 * konum rAF'te doğrudan `transform`a yazılır; bırakınca state'e ve depolamaya geçer (yerleşme CSS geçişiyle).
 * Bkz. launcherPosition.ts.
 */
export function useLauncherDrag(ref: RefObject<HTMLButtonElement | null>, storage: Storage | null) {
  const [offset, setOffset] = useState(0);
  const [side, setSide] = useState<LauncherSide>('right');
  const [bounds, setBounds] = useState<LauncherBounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const offsetRef = useRef(0);
  const sideRef = useRef<LauncherSide>('right');
  const boundsRef = useRef<LauncherBounds | null>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  /** Depolama yoksa bu ziyaretteki konum (döndürmede korunur). */
  const memoryRef = useRef<{ side: LauncherSide; ratio: number } | null>(null);

  const commit = useCallback(
    (nextSide: LauncherSide, nextOffset: number) => {
      const b = boundsRef.current;
      offsetRef.current = nextOffset;
      sideRef.current = nextSide;
      setOffset(nextOffset);
      setSide(nextSide);
      if (!b) return;
      memoryRef.current = { side: nextSide, ratio: (b.defaultTop + nextOffset) / b.viewportHeight };
      savePosition(storage, nextSide, b.defaultTop + nextOffset, b.viewportHeight);
    },
    [storage],
  );

  // İlk yer (kayıtlı konum) boyamadan önce; yeniden boyutlandırma / döndürmede sınırlar yeniden hesaplanır, taraf
  // korunur.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      if (session.current) return;
      const b = measure(el);
      boundsRef.current = b;
      const saved = readSavedPosition(storage) ?? memoryRef.current;
      const nextOffset = offsetFromRatio(saved?.ratio ?? null, b);
      const nextSide = saved?.side ?? 'right';
      offsetRef.current = nextOffset;
      sideRef.current = nextSide;
      setBounds(b);
      setOffset(nextOffset);
      setSide(nextSide);
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
    const b = boundsRef.current;
    suppressClick.current = false;
    const startOffsetX = b ? offsetXForSide(sideRef.current, b) : 0;
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX,
      startOffsetY: offsetRef.current,
      moved: false,
      latestX: startOffsetX,
      latestY: offsetRef.current,
      samples: [{ t: event.timeStamp, x: event.clientX }],
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
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.moved) {
      if (!isDragMovement(dy, dx)) return;
      s.moved = true;
      setDragging(true);
    }
    s.samples.push({ t: event.timeStamp, x: event.clientX });
    if (s.samples.length > 12) s.samples.shift();
    s.latestX = clampOffsetX(s.startOffsetX + dx, b);
    s.latestY = offsetForTop(b.defaultTop + s.startOffsetY + dy, b);
    if (!s.frame) {
      const el = event.currentTarget;
      s.frame = requestAnimationFrame(() => {
        s.frame = 0;
        el.style.transform = translate(s.latestX, s.latestY);
      });
    }
  }, []);

  const endDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const s = session.current;
      const b = boundsRef.current;
      if (!s || event.pointerId !== s.pointerId) return;
      session.current = null;
      if (s.frame) cancelAnimationFrame(s.frame);
      if (!s.moved || !b) return; // dokunuş → click paneli açar
      suppressClick.current = true;
      const size = b.size ?? 0;
      const centerX = (b.defaultLeft ?? 0) + s.latestX + size / 2;
      const velocity = event.type === 'pointercancel' ? 0 : releaseVelocityX(s.samples);
      const nextSide = snapSide(centerX, b.viewportWidth ?? 0, velocity);
      // Kenara yapışma: önce sürükleme işareti kalkar (geçiş yeniden açılır), stil uygulanır, sonra hedef yazılır →
      // transform geçişi bırakılan yerden kenara kaydırır (Hareketi azalt'ta anında). React aynı değeri yazar.
      const el = event.currentTarget;
      el.removeAttribute('data-dragging');
      void el.offsetWidth;
      el.style.transform = translate(offsetXForSide(nextSide, b), s.latestY);
      setDragging(false);
      commit(nextSide, s.latestY);
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const b = boundsRef.current;
      if (!b) return;
      const step = keyStep(event.key);
      const nextSide = keySide(event.key);
      if (step === null && nextSide === null) return;
      event.preventDefault();
      if (nextSide) commit(nextSide, offsetRef.current);
      else commit(sideRef.current, offsetForTop(b.defaultTop + offsetRef.current + (step ?? 0), b));
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
    side,
    /** Yataydaki kayma (sağ: 0); ölçülmeden önce 0. */
    offsetX: bounds ? offsetXForSide(side, bounds) : 0,
    /** Düğmenin şu anki üst kenarı (baloncuk için); ölçülmeden önce null. */
    top: bounds ? bounds.defaultTop + offset : null,
    viewportHeight: bounds?.viewportHeight ?? null,
    dragging,
    ready,
    consumeDragClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onKeyDown },
  };
}
