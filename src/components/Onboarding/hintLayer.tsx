/**
 * Yerinde ipucu baloncukları + "Kısa tur" — hafif, kütüphanesiz. Bu modül ilk yüke GİRMEZ: çağıran yerler
 * (karşılama kartı, maç sekmeleri, yıldız, yüzen düğmeler) ihtiyaç anında düz `import()` ile ister.
 *
 * Kendi React kökünü `<body>` sonuna kurar (sayfa ağacına ve stillerine dokunmaz); metinler çağırandan çevrilmiş
 * gelir (kök i18n bağlamı dışında). Aynı anda tek ipucu: sonrakiler sıraya girer; tur sırayı keser.
 *
 * Erişilebilirlik: Esc kapatır; tur baloncuğu `role="dialog"` (modal değil), açılınca odak birincil düğmeye, tur
 * bitince önceki öğeye (ya da verilen `returnFocus`) döner. Kendiliğinden çıkan ipuçları odağı çalmaz (`role="status"`).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Router from 'next/router';
import styles from './hintLayer.module.scss';

export type HintLabels = {
  ok: string;
  close: string;
  next: string;
  done: string;
  skip: string;
  /** "2/4" gibi adım metni. */
  step: (current: number, total: number) => string;
};

/** Bağlantı noktası: CSS seçici (virgüllü liste; görünür ilk eşleşme) ya da öğe. */
export type HintAnchor = string | Element | (() => Element | null);

export type TourStep = {
  /** Sırayla denenir; hiçbiri yoksa adım atlanır. */
  anchors: HintAnchor[];
  title: string;
  body: string;
};

type Placement = 'above' | 'below' | 'auto';

const GAP_PX = 10;
const EDGE_PX = 12;

/** Öğe çizili ve yatayda ekranda mı (yatay kayan çip satırında ekran dışındakiler sayılmaz). */
export function isUsableAnchor(el: Element, viewportWidth = window.innerWidth): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.right <= 0 || rect.left >= viewportWidth) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

export function resolveAnchor(anchor: HintAnchor): Element | null {
  if (typeof anchor === 'function') return anchor();
  if (typeof anchor !== 'string') return anchor.isConnected && isUsableAnchor(anchor) ? anchor : null;
  for (const el of Array.from(document.querySelectorAll(anchor))) if (isUsableAnchor(el)) return el;
  return null;
}

function resolveFirst(anchors: readonly HintAnchor[]): Element | null {
  for (const a of anchors) {
    const el = resolveAnchor(a);
    if (el) return el;
  }
  return null;
}

/** Baloncuk konumu (saf; test edilir): önce tercih edilen yön, sığmazsa öbürü; yatayda ekrana kıstırılır. */
export function placeBubble(
  anchor: { top: number; bottom: number; left: number; width: number },
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: Placement,
): { top: number; left: number; arrowX: number; side: 'above' | 'below' } {
  const fitsAbove = anchor.top - GAP_PX - bubble.height >= EDGE_PX;
  const fitsBelow = anchor.bottom + GAP_PX + bubble.height <= viewport.height - EDGE_PX;
  let side: 'above' | 'below';
  if (placement === 'above') side = fitsAbove || !fitsBelow ? 'above' : 'below';
  else if (placement === 'below') side = fitsBelow || !fitsAbove ? 'below' : 'above';
  else side = fitsBelow ? 'below' : fitsAbove ? 'above' : 'below';
  const top = side === 'above' ? anchor.top - GAP_PX - bubble.height : anchor.bottom + GAP_PX;
  const center = anchor.left + anchor.width / 2;
  const maxLeft = Math.max(EDGE_PX, viewport.width - EDGE_PX - bubble.width);
  const left = Math.min(Math.max(center - bubble.width / 2, EDGE_PX), maxLeft);
  const arrowX = Math.min(Math.max(center - left, 16), bubble.width - 16);
  return { top: Math.round(top), left: Math.round(left), arrowX: Math.round(arrowX), side };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Kaydırma / boyut değişiminde rAF ile yeniden ölç. */
function useReposition(update: () => void) {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    // Sanallaştırılmış liste / geç gelen içerik öğeyi taşıyabilir: seyrek yoklama.
    const interval = window.setInterval(schedule, 600);
    return () => {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.clearInterval(interval);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [update]);
}

/** Sayfa değişince (kök Next ağacının dışında olduğumuz için) kendiliğinden kapan. */
function useCloseOnRouteChange(close: () => void) {
  useEffect(() => {
    Router.events.on('routeChangeStart', close);
    return () => Router.events.off('routeChangeStart', close);
  }, [close]);
}

type BubbleProps = {
  anchors: readonly HintAnchor[];
  title?: string;
  body: string;
  placement: Placement;
  labels: HintLabels;
  /** Tur adımı: { index, total } — yoksa tek ipucu. */
  tour?: { index: number; total: number; onNext: () => void; onSkip: () => void };
  onClose: () => void;
};

function Bubble({ anchors, title, body, placement, labels, tour, onClose }: BubbleProps) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<Element | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrowX: number; side: 'above' | 'below' } | null>(null);
  const [ring, setRing] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const update = useCallback(() => {
    if (!anchorRef.current?.isConnected || !isUsableAnchor(anchorRef.current)) anchorRef.current = resolveFirst(anchors);
    const anchor = anchorRef.current;
    const el = ref.current;
    if (!anchor || !el) {
      setPos(null);
      setRing(null);
      return;
    }
    const r = anchor.getBoundingClientRect();
    const next = placeBubble(r, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, placement);
    setPos((cur) => (cur && cur.top === next.top && cur.left === next.left && cur.arrowX === next.arrowX && cur.side === next.side ? cur : next));
    if (tour) {
      const nr = { top: Math.round(r.top) - 4, left: Math.round(r.left) - 4, width: Math.round(r.width) + 8, height: Math.round(r.height) + 8 };
      setRing((cur) => (cur && cur.top === nr.top && cur.left === nr.left && cur.width === nr.width && cur.height === nr.height ? cur : nr));
    }
  }, [anchors, placement, tour]);

  // Adım değişince: öğeyi bul, gerekirse görünür alana kaydır, konumla; turda odağı birincil düğmeye ver.
  useLayoutEffect(() => {
    anchorRef.current = resolveFirst(anchors);
    const anchor = anchorRef.current;
    if (anchor && tour) {
      const r = anchor.getBoundingClientRect();
      const header = 72;
      const bottomNav = 80;
      if (r.top < header || r.bottom > window.innerHeight - bottomNav) {
        anchor.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }
    update();
  }, [anchors, tour, update]);

  // Turda odak birincil düğmeye — konum belli olup baloncuk görünür olduktan sonra (gizli öğe odak almaz).
  const focused = useRef(false);
  useEffect(() => {
    if (!tour || !pos || focused.current) return;
    focused.current = true;
    primaryRef.current?.focus({ preventScroll: true });
  }, [tour, pos]);

  useReposition(update);
  useCloseOnRouteChange(tour ? tour.onSkip : onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (tour) tour.onSkip();
      else onClose();
    };
    // Tek ipucu: bağlandığı öğeye (ör. AI sekmesine) dokunulunca kapanır.
    const onPointer = (e: PointerEvent) => {
      if (tour) return;
      const target = e.target as Node | null;
      if (target && anchorRef.current?.contains(target)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [tour, onClose]);

  const style: CSSProperties = pos
    ? ({ top: pos.top, left: pos.left, '--hint-arrow-x': `${pos.arrowX}px` } as CSSProperties)
    : { top: 0, left: 0, visibility: 'hidden' };
  const titleId = `${uid}-t`;
  const bodyId = `${uid}-b`;
  const last = tour ? tour.index === tour.total - 1 : true;

  return (
    <>
      {tour && ring && pos ? <div className={styles.ring} style={ring} aria-hidden="true" /> : null}
      <div
        ref={ref}
        className={styles.bubble}
        data-side={pos?.side ?? 'below'}
        style={style}
        {...(tour
          ? { role: 'dialog', 'aria-modal': false, 'aria-labelledby': title ? titleId : undefined, 'aria-describedby': bodyId }
          : { role: 'status' })}
      >
        <span className={styles.arrow} aria-hidden="true" />
        <div className={styles.head}>
          {title ? (
            <strong id={titleId} className={styles.title}>
              {title}
            </strong>
          ) : null}
          {tour ? <span className={styles.step}>{labels.step(tour.index + 1, tour.total)}</span> : null}
        </div>
        <p id={bodyId} className={styles.body}>
          {body}
        </p>
        <div className={styles.actions}>
          {tour && !last ? (
            <button type="button" className={styles.secondary} onClick={tour.onSkip}>
              {labels.skip}
            </button>
          ) : null}
          <button
            ref={primaryRef}
            type="button"
            className={styles.primary}
            onClick={tour ? (last ? tour.onSkip : tour.onNext) : onClose}
          >
            {tour ? (last ? labels.done : labels.next) : labels.ok}
          </button>
        </div>
      </div>
    </>
  );
}

type SideLabelItem = { anchor: Element; text: string };

/** Sağ/sol alttaki yüzen düğmelerin yanına kısa etiketler; Esc, ✕ ya da herhangi bir dokunuş kapatır. */
function SideLabels({ items, side, closeLabel, onClose }: { items: SideLabelItem[]; side: 'left' | 'right'; closeLabel: string; onClose: () => void }) {
  const [rects, setRects] = useState<{ top: number; left: number; right: number; height: number }[] | null>(null);
  const update = useCallback(() => {
    const next = items.map(({ anchor }) => {
      const r = anchor.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) };
    });
    setRects((cur) => (cur && JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [items]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- konum yalnız DOM ölçümüyle bilinir (boyamadan önce)
  useLayoutEffect(update, [update]);
  useReposition(update);
  useCloseOnRouteChange(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Bir sonraki dokunuşta (düğmelere dahil) kapanır; açılış dokunuşu sayılmasın diye bir kare sonra dinlenir.
    let armed = false;
    const t = window.setTimeout(() => (armed = true), 300);
    const onPointer = () => {
      if (armed) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);

  if (!rects) return null;
  const vw = window.innerWidth;
  return (
    <div role="status" className={styles.sideLabels}>
      {items.map((item, i) => {
        const r = rects[i]!;
        const style: CSSProperties =
          side === 'right'
            ? { top: r.top + r.height / 2, right: vw - r.left + 8 }
            : { top: r.top + r.height / 2, left: r.right + 8 };
        return (
          <span key={item.text} className={styles.sideLabel} data-side={side} style={style}>
            {item.text}
            {i === 0 ? (
              <button type="button" className={styles.sideClose} aria-label={closeLabel} onClick={onClose}>
                ✕
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

// ── Tek kök + sıra ─────────────────────────────────────────────────────────────────────────────────────────────

let root: Root | null = null;
let active = false;
const queue: (() => void)[] = [];

function getRoot(): Root {
  if (!root) {
    const host = document.createElement('div');
    host.setAttribute('data-hint-layer', '');
    // Uygulama kökünün içine: yazı tipi değişkeni (`--font-sans`) orada tanımlı.
    (document.querySelector('[data-app-root]') ?? document.body).appendChild(host);
    root = createRoot(host);
  }
  return root;
}

function finish() {
  active = false;
  getRoot().render(null);
  const next = queue.shift();
  if (next) window.setTimeout(next, 250);
}

function run(task: () => void) {
  if (active) queue.push(task);
  else task();
}

/** Şu an bir ipucu / tur ekranda mı. */
export function isHintActive(): boolean {
  return active;
}

/**
 * Tek ipucu. Bağlantı öğesi şu an yoksa `false` döner (çağıran başka yol seçebilir) — sıradaysa öğe sırası gelince
 * yeniden aranır, yoksa sessizce atlanır.
 */
export function showHint(opts: {
  anchors: HintAnchor[];
  title?: string;
  body: string;
  placement?: Placement;
  labels: HintLabels;
  onShow?: () => void;
}): boolean {
  if (!resolveFirst(opts.anchors)) return false;
  run(() => {
    if (!resolveFirst(opts.anchors)) return finishIfIdle();
    active = true;
    opts.onShow?.();
    getRoot().render(
      <Bubble anchors={opts.anchors} title={opts.title} body={opts.body} placement={opts.placement ?? 'auto'} labels={opts.labels} onClose={finish} />,
    );
  });
  return true;
}

function finishIfIdle() {
  const next = queue.shift();
  if (next) next();
}

/** Kısa tur: adımlar sırayla; öğesi bulunmayan adım atlanır. Sıradaki ipuçlarını bekletmez, ekrandakini kapatır. */
export function startTour(steps: TourStep[], labels: HintLabels, opts: { returnFocus?: () => HTMLElement | null } = {}): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const available = steps.filter((s) => resolveFirst(s.anchors));
  if (available.length === 0) return;
  active = true;
  const end = () => {
    finish();
    const target = opts.returnFocus?.() ?? (previous?.isConnected ? previous : null);
    target?.focus({ preventScroll: true });
  };
  const render = (index: number) => {
    const step = available[index]!;
    getRoot().render(
      <Bubble
        key={index}
        anchors={step.anchors}
        title={step.title}
        body={step.body}
        placement="auto"
        labels={labels}
        tour={{ index, total: available.length, onNext: () => render(index + 1), onSkip: end }}
        onClose={end}
      />,
    );
  };
  render(0);
}

/** Yüzen düğme etiketleri (tek sefer). */
export function showSideLabels(items: SideLabelItem[], opts: { side: 'left' | 'right'; closeLabel: string; onShow?: () => void }): void {
  run(() => {
    if (!items.every(({ anchor }) => anchor.isConnected && isUsableAnchor(anchor))) return finishIfIdle();
    active = true;
    opts.onShow?.();
    getRoot().render(<SideLabels items={items} side={opts.side} closeLabel={opts.closeLabel} onClose={finish} />);
  });
}
