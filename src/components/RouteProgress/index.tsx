import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import styles from './RouteProgress.module.scss';

/** Bundan kısa geçişlerde hiçbir şey görünmez. */
const SHOW_AFTER_MS = 200;
/** Tamamlanınca dolgunun sona varıp sönmesi (RouteProgress.module.scss geçişleriyle aynı). */
const FINISH_MS = 450;

/**
 * 07 · Yuvarlanan top (docs/animasyon-referans/07-yuvarlanan-top.html): sayfa geçişi 200 ms'yi aşarsa header'ın alt
 * çizgisinde ilerleme çubuğu ve ucunda yuvarlanan top. Durum `data-state` ile (idle → running → done → idle); yeniden
 * render yok, yalnız transform + opacity.
 */
export default function RouteProgress() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let showTimer: number | undefined;
    let hideTimer: number | undefined;
    const setState = (state: 'idle' | 'running' | 'done') => {
      el.dataset.state = state;
    };

    const start = () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      setState('idle');
      showTimer = window.setTimeout(() => setState('running'), SHOW_AFTER_MS);
    };

    const done = () => {
      window.clearTimeout(showTimer);
      if (el.dataset.state !== 'running') {
        setState('idle');
        return;
      }
      setState('done');
      hideTimer = window.setTimeout(() => setState('idle'), FINISH_MS);
    };

    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
    };
  }, [router.events]);

  return (
    <div ref={ref} className={styles.root} data-state="idle" aria-hidden>
      <span className={styles.fill} />
      <span className={styles.track}>
        <span className={styles.ball} />
      </span>
    </div>
  );
}
