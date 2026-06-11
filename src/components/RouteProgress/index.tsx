import { useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from './RouteProgress.module.scss';

/**
 * Sayfa geçişlerinde üstte ince bir ilerleme çubuğu gösterir.
 * GSSP beklerken kullanıcıya anında geri bildirim verir.
 */
export default function RouteProgress() {
  const router = useRouter();

  useEffect(() => {
    const bar = document.getElementById('route-progress-bar');
    if (!bar) return;

    const start = () => {
      bar.classList.add(styles.active);
      bar.style.width = '30%';
      window.requestAnimationFrame(() => {
        bar.style.width = '70%';
      });
    };

    const done = () => {
      bar.style.width = '100%';
      window.setTimeout(() => {
        bar.classList.remove(styles.active);
        bar.style.width = '0%';
      }, 200);
    };

    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);

    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
    };
  }, [router.events]);

  return <div id="route-progress-bar" className={styles.bar} aria-hidden />;
}
