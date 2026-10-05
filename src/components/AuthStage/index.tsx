import { useEffect, useRef } from 'react';
import type { StageHandle } from './stageScene';
import { webglAvailable } from '@/components/pitch3d/webgl';
import styles from './authStage.module.scss';

/** three.js sahnesi ayrı parça: sayfa yüklenip tarayıcı boşa düşünce gelir (ilk yüke ve diğer sayfalara girmez). */
const loadScene = () => import('./stageScene');

export { webglAvailable };

/**
 * Giriş / kayıt sahnesi (gece maçı + 3D top). Sunucu HTML'inde yalnız sabit boyutlu, gradyanlı kutu (kayma yok);
 * WebGL yoksa ya da yükleme başarısızsa bu gradyan kalır, hata fırlatılmaz. aria-hidden; odaklanabilir öğe yok.
 * Gündüz / gece: açık temada CSS katmanı (gündüz gradyanı) opaklıkla geçer; 3D sahne de temayı izler.
 * Boyutu çağıran verir (`className`).
 */
export default function AuthStage({
  className,
  goalLabel,
  hintLabel,
}: {
  className?: string;
  goalLabel: string;
  hintLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageHandle | null>(null);
  /** Son etiketler: sahne sonradan yüklenince güncel dil kullanılsın (aşağıdaki effect günceller). */
  const labelsRef = useRef({ goalLabel, hintLabel });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
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
            stageRef.current = mod.mountStage(host, {
              reduced,
              lite,
              canvasClassName: styles.canvas!,
              handleClassName: styles.handle!,
              goalClassName: styles.goal!,
              hintClassName: styles.hint!,
              ...labelsRef.current,
            });
          } catch {
            stageRef.current = null; // WebGL başlatılamadı: gradyan kalır
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
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  // Dil sonradan değişirse (istemcide seçiliyor) sahne yeniden kurulmadan yazılar güncellenir.
  useEffect(() => {
    labelsRef.current = { goalLabel, hintLabel };
    stageRef.current?.setLabels(goalLabel, hintLabel);
  }, [goalLabel, hintLabel]);

  return <div ref={hostRef} className={className ? `${styles.scene} ${className}` : styles.scene} aria-hidden="true" />;
}
