import { useEffect, useRef, type ReactNode } from 'react';
import styles from './scaledScene.module.scss';

/** Sahneler 504 px genişlikte çizilir. */
export const SCENE_WIDTH = 504;

/**
 * 504×230 sahneyi bulunduğu kutunun genişliğine ölçekler (yükseklik en-boy oranından; kayma yok).
 * `className` kutuya (ör. köşe yuvarlama, en büyük genişlik).
 */
export default function ScaledScene({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = ref.current;
    if (!stage || typeof ResizeObserver !== 'function') return;
    const fit = () => stage.style.setProperty('--s', String(stage.clientWidth / SCENE_WIDTH));
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    fit();
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${styles.stage} ${className ?? ''}`}>
      <div className={styles.scale}>{children}</div>
    </div>
  );
}
