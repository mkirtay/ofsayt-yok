import { useEffect, useRef } from 'react';
import styles from './authStage.module.scss';

/** three.js sahnesi ayrı parça: sayfa yüklenip tarayıcı boşa düşünce gelir (ilk yüke ve diğer sayfalara girmez). */
const loadScene = () => import('./stageScene');

/** WebGL bağlamı açılabiliyor mu (deneme bağlamı hemen bırakılır). */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Giriş / kayıt sahnesi (gece maçı + 3D top). Sunucu HTML'inde yalnız sabit boyutlu, gradyanlı kutu (kayma yok);
 * WebGL yoksa ya da yükleme başarısızsa bu gradyan kalır, hata fırlatılmaz. aria-hidden; odaklanabilir öğe yok.
 * Boyutu çağıran verir (`className`).
 */
export default function AuthStage({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let stage: { dispose: () => void } | null = null;
    let idleId = 0;
    let timer = 0;

    const start = () => {
      if (cancelled || !webglAvailable()) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const lite = window.matchMedia('(max-width: 1023px)').matches;
      loadScene().then(
        (mod) => {
          if (cancelled) return;
          try {
            stage = mod.mountStage(host, { reduced, lite, canvasClassName: styles.canvas!, handleClassName: styles.handle! });
          } catch {
            stage = null; // WebGL başlatılamadı: gradyan kalır
          }
        },
        () => {},
      );
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(start, { timeout: 2000 });
      else timer = window.setTimeout(start, 800);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId) window.cancelIdleCallback(idleId);
      if (timer) window.clearTimeout(timer);
      stage?.dispose();
    };
  }, []);

  return <div ref={hostRef} className={className ? `${styles.scene} ${className}` : styles.scene} aria-hidden="true" />;
}
