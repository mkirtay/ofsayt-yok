import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useRouter } from 'next/router';
import {
  clampToPitch,
  idleNudge,
  kickoffSpot,
  pitchGeometry,
  pitchShapes,
  releaseVelocity,
  stepBall,
  type Ball,
  type PitchGeometry,
  type PointerSample,
} from './pitchPhysics';
import styles from './pitchPlayground.module.scss';

const GOAL_LABEL: Record<string, string> = { tr: 'GOL!', en: 'GOAL!' };
/** Gol efekti süresi; sonra top ortaya döner. */
const GOAL_PAUSE_MS = 1300;
/** Bu kadar duran top kendi kendine hafifçe yuvarlanır. */
const IDLE_AFTER_MS = 4000;

/**
 * Giriş / kayıt arka planı: silik saha çizgileri (SVG) + fırlatılabilir top. Fizik pitchPhysics.ts (kütüphane yok);
 * top yalnız `transform` ile, rAF'te doğrudan çizilir (React yeniden çizimi yok). Sekme arka plandayken döngü durur.
 * Top kartın arkasında başlamasın diye başlama noktası kartın dışındaki boş alanda (kickoffSpot); gol sonrası oraya döner.
 * Hareketi azalt: top bu noktada sabit, tutulamaz, kendi kendine hareket etmez.
 */
export default function PitchPlayground() {
  const { locale } = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<PitchGeometry | null>(null);
  const [goalShot, setGoalShot] = useState(0);
  const [reduced, setReduced] = useState(false);

  const geoRef = useRef<PitchGeometry | null>(null);
  const ball = useRef<Ball | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; samples: PointerSample[] } | null>(null);
  const goalUntil = useRef(0);
  /** Başlama / gol sonrası dönüş noktası (form kartının dışında). */
  const spot = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const restSince = useRef(0);

  const paint = useCallback(() => {
    const el = ballRef.current;
    const g = geoRef.current;
    const b = ball.current;
    if (!el || !g || !b) return;
    el.style.transform = `translate(${b.x - g.ballRadius}px, ${b.y - g.ballRadius}px)`;
  }, []);

  // Top öğesi geometri gelince çizilir → ilk konumu hemen yaz (hareketi azalt'ta döngü yok).
  useEffect(() => paint(), [geo, paint]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Kap boyutu → geometri; top saha içinde kalır (ilk açılışta ortada).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const g = pitchGeometry(el.clientWidth, el.clientHeight);
      geoRef.current = g;
      // Kartın yeri: kapsayıcıdaki `[data-pitch-avoid]` (form kartı), bu kaba göre.
      const card = el.closest('[data-pitch-host]')?.querySelector('[data-pitch-avoid]');
      const own = el.getBoundingClientRect();
      const cr = card?.getBoundingClientRect();
      spot.current = kickoffSpot(g, cr ? { x: cr.left - own.left, y: cr.top - own.top, w: cr.width, h: cr.height } : null);
      if (!ball.current) {
        const c = spot.current;
        ball.current = { x: c.x, y: c.y, vx: 0, vy: 0 };
      } else {
        const p = clampToPitch(ball.current.x, ball.current.y, g);
        ball.current = { ...ball.current, ...p };
      }
      setGeo(g);
      paint();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paint]);

  useEffect(() => {
    if (reduced) {
      if (geoRef.current) {
        const c = spot.current;
        ball.current = { x: c.x, y: c.y, vx: 0, vy: 0 };
        paint();
      }
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      const g = geoRef.current;
      const b = ball.current;
      if (!g || !b || drag.current) return;
      if (goalUntil.current) {
        if (ts < goalUntil.current) return;
        goalUntil.current = 0;
        const c = spot.current;
        ball.current = { x: c.x, y: c.y, vx: 0, vy: 0 };
        restSince.current = ts;
        ballRef.current?.removeAttribute('data-scored');
        paint();
        return;
      }
      const { ball: next, goal } = stepBall(b, dt, g);
      ball.current = next;
      if (goal) {
        goalUntil.current = ts + GOAL_PAUSE_MS;
        ballRef.current?.setAttribute('data-scored', '');
        setGoalShot((n) => n + 1);
      } else if (next.vx === 0 && next.vy === 0) {
        if (!restSince.current) restSince.current = ts;
        else if (ts - restSince.current > IDLE_AFTER_MS) {
          ball.current = { ...next, ...idleNudge() };
          restSince.current = 0;
        }
      } else {
        restSince.current = 0;
      }
      paint();
    };
    const start = () => {
      if (!raf && document.visibilityState === 'visible') {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced, paint]);

  const local = (e: PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const b = ball.current;
    if (reduced || !b || goalUntil.current) return;
    e.preventDefault();
    const p = local(e);
    drag.current = { id: e.pointerId, dx: b.x - p.x, dy: b.y - p.y, samples: [{ t: e.timeStamp, x: b.x, y: b.y }] };
    ball.current = { ...b, vx: 0, vy: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // sentetik olay: yakalama olmadan da çalışır
    }
    e.currentTarget.setAttribute('data-dragging', '');
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const g = geoRef.current;
    if (!d || !g || e.pointerId !== d.id) return;
    const p = local(e);
    const next = clampToPitch(p.x + d.dx, p.y + d.dy, g);
    ball.current = { x: next.x, y: next.y, vx: 0, vy: 0 };
    d.samples.push({ t: e.timeStamp, x: next.x, y: next.y });
    if (d.samples.length > 12) d.samples.shift();
    paint();
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    e.currentTarget.removeAttribute('data-dragging');
    const v = e.type === 'pointercancel' ? { vx: 0, vy: 0 } : releaseVelocity(d.samples);
    if (ball.current) ball.current = { ...ball.current, ...v };
    restSince.current = 0;
  };

  return (
    <div ref={rootRef} className={styles.root} data-reduced={reduced ? '' : undefined}>
      {geo ? (
        <svg className={styles.lines} width={geo.width} height={geo.height} viewBox={`0 0 ${geo.width} ${geo.height}`}>
          {pitchShapes(geo).map((s, i) =>
            s.kind === 'rect' ? (
              <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={2} className={s.goal ? styles.goalNet : undefined} />
            ) : s.kind === 'line' ? (
              <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
            ) : (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} className={s.fill ? styles.spot : undefined} />
            ),
          )}
        </svg>
      ) : null}
      {geo ? (
        <div
          ref={ballRef}
          className={styles.ball}
          style={{ width: geo.ballRadius * 2, height: geo.ballRadius * 2 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : null}
      {goalShot > 0 ? (
        <div key={goalShot} className={styles.goal}>
          {GOAL_LABEL[locale ?? 'tr'] ?? GOAL_LABEL.tr}
        </div>
      ) : null}
    </div>
  );
}
