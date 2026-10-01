import { useEffect, useRef, type ReactNode } from 'react';
import styles from './scaledScene.module.scss';

/** Sahneler 504 px genişlikte çizilir. */
export const SCENE_WIDTH = 504;

/**
 * 504 px genişlikte çizilen sahneyi bulunduğu kutunun genişliğine ölçekler (yükseklik en-boy oranından; kayma yok).
 * `height`: sahnenin çizim yüksekliği (varsayılan 230). `className` kutuya (ör. köşe yuvarlama, en büyük genişlik).
 */
export default function ScaledScene({
  children,
  className,
  height = 230,
}: {
  children: ReactNode;
  className?: string;
  height?: number;
}) {
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
    <div ref={ref} className={`${styles.stage} ${className ?? ''}`} style={{ aspectRatio: `${SCENE_WIDTH} / ${height}` }}>
      <div className={styles.scale}>{children}</div>
    </div>
  );
}
