import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/router';
import { KURAL_KOSESI_OPEN_EVENT, openKuralKosesi } from './openEvent';
import { isKuralKosesiHidden } from './paths';
import { ASSISTANT_OPEN_EVENT, isAssistantHidden, openAssistant } from '@/components/Assistant/openEvent';

/**
 * Kural Köşesi'nin Layout'taki tek parçası — giriş/kayıt ve admin dışında her sayfada.
 *
 * Düğme (ve kendi CSS'i) ilk yüke girmez: sayfa `load` olduktan sonra boşta düz `import()` ile istenir
 * (`next/dynamic` değil: o, _app parçasına yükleyici çalışma zamanını ekliyordu). Panel ve sahneler ise ancak
 * ilk tıklamada (ya da üzerine gelince) Launcher'dan yüklenir.
 */
export default function KuralKosesiMount() {
  const { pathname } = useRouter();
  const [Launcher, setLauncher] = useState<ComponentType<{ assistantHidden?: boolean }> | null>(null);
  // Düğme gelmeden sayfadan "aç" istendiyse: düğmeyi hemen yükle, gelince isteği yinele (Launcher olayı dinler).
  const pendingOpen = useRef<'rules' | 'assistant' | null>(null);
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
    const early = (which: 'rules' | 'assistant') => () => {
      if (loaded.current) return;
      pendingOpen.current = which;
      load();
    };
    const onEarlyOpen = early('rules');
    // AI Asistan balonu da Launcher'da yaşar: header menüsünden erken açılış aynı yolla.
    const onEarlyAssistant = early('assistant');
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(load, { timeout: 4000 });
      } else {
        timeoutId = window.setTimeout(load, 1500);
      }
    };
    window.addEventListener(KURAL_KOSESI_OPEN_EVENT, onEarlyOpen);
    window.addEventListener(ASSISTANT_OPEN_EVENT, onEarlyAssistant);
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener(KURAL_KOSESI_OPEN_EVENT, onEarlyOpen);
      window.removeEventListener(ASSISTANT_OPEN_EVENT, onEarlyAssistant);
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  // Çocuğun (Launcher) olay dinleyicisi bu effect'ten önce kurulur.
  useEffect(() => {
    if (Launcher && pendingOpen.current) {
      const which = pendingOpen.current;
      pendingOpen.current = null;
      if (which === 'assistant') openAssistant();
      else openKuralKosesi();
    }
  }, [Launcher]);

  if (!Launcher || isKuralKosesiHidden(pathname)) return null;
  return <Launcher assistantHidden={isAssistantHidden(pathname)} />;
}
