import { useEffect, useState, type ComponentType } from 'react';

/**
 * Bileşeni ilk çizildiğinde düz `import()` ile yükler; gelene kadar hiçbir şey çizmez. Animasyon gibi "olmasa da
 * olur" parçalar için (kutuyu çağıran tutar). `next/dynamic` yerine: yeni yerlerde next/dynamic kullanmak
 * Turbopack'in ana sayfa ilk yük parçalarını yeniden dağıtıp yerel Lighthouse LCP'sini ~70 ms kötüleştiriyordu
 * (bkz. KuralKosesi/Mount). `load` modül düzeyinde sabit bir fonksiyon olmalı.
 */
export default function LazyLoad<P extends object>({
  load,
  props,
}: {
  load: () => Promise<{ default: ComponentType<P> }>;
  props: P;
}) {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (mod) => {
        if (!cancelled) setComponent(() => mod.default);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [load]);
  return Component ? <Component {...props} /> : null;
}
