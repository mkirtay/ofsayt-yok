import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/router';
import { KURAL_KOSESI_OPEN_EVENT, openKuralKosesi } from './openEvent';
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
  // Düğme gelmeden sayfadan "aç" istendiyse: düğmeyi hemen yükle, gelince isteği yinele (Launcher olayı dinler).
  const pendingOpen = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const load = () => {
      import('./Launcher').then(
        (mod) => {
          if (cancelled) return;
          loaded.current = true;
          setLauncher(() => mod.default);
        },
        () => {},
      );
    };
    const onEarlyOpen = () => {
      if (loaded.current) return;
      pendingOpen.current = true;
      load();
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(load, { timeout: 4000 });
      } else {
        timeoutId = window.setTimeout(load, 1500);
      }
    };
    window.addEventListener(KURAL_KOSESI_OPEN_EVENT, onEarlyOpen);
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener(KURAL_KOSESI_OPEN_EVENT, onEarlyOpen);
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  // Çocuğun (Launcher) olay dinleyicisi bu effect'ten önce kurulur.
  useEffect(() => {
    if (Launcher && pendingOpen.current) {
      pendingOpen.current = false;
      openKuralKosesi();
    }
  }, [Launcher]);

  if (!Launcher || isKuralKosesiHidden(pathname)) return null;
  return <Launcher />;
}
