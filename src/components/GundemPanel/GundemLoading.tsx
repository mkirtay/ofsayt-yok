import { useEffect, useState, type ComponentType } from 'react';
import styles from './gundemPanel.module.scss';

// Sahne ve CSS'i ayrı parçada. Ortak LazyLoad yerine yerel import(): GundemPanel'e paylaşılan bir modül bağımlılığı
// eklemek Turbopack'in ana sayfa ilk yük parçalarını yeniden bölüyor ve yerel Lighthouse'u 1 puan düşürüyordu.
const loadStandWave = () => import('@/components/PitchScenes/StandWave');

/** Akışın ilk yüklemesi: 05 · Tribün dalgası (en-boy oranlı kutu baştan yer tutar) + durum metni. */
export default function GundemLoading({ label }: { label: string }) {
  const [StandWave, setStandWave] = useState<ComponentType | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStandWave().then(
      (mod) => {
        if (!cancelled) setStandWave(() => mod.default);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className={styles.loadingStand} role="status">
      <div className={styles.loadingStage} aria-hidden="true">
        {StandWave ? <StandWave /> : null}
      </div>
      <p className={styles.loadingText}>{label}</p>
    </div>
  );
}
