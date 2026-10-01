import { useEffect, useState, type ComponentType } from 'react';
import { useRouter } from 'next/router';
import { isKuralKosesiHidden } from './paths';

/**
 * Kural Köşesi'nin Layout'taki tek parçası — giriş/kayıt ve admin dışında her sayfada.
 *
 * Düğme (ve kendi CSS'i) ilk yüke girmez: sayfa `load` olduktan sonra boşta düz `import()` ile istenir
 * (`next/dynamic` değil: o, _app parçasına yükleyici çalışma zamanını ekliyordu). Panel ve sahneler ise ancak
 * ilk tıklamada (ya da üzerine gelince) Launcher'dan yüklenir.
 */
export default function KuralKosesiMount() {
  const { pathname } = useRouter();
  const [Launcher, setLauncher] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const load = () => {
      import('./Launcher').then(
        (mod) => {
          if (!cancelled) setLauncher(() => mod.default);
        },
        () => {},
      );
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(load, { timeout: 4000 });
      } else {
        timeoutId = window.setTimeout(load, 1500);
      }
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!Launcher || isKuralKosesiHidden(pathname)) return null;
  return <Launcher />;
}
