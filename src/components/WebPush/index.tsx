import { useEffect, useState } from 'react';
import styles from './webPush.module.scss';

/**
 * Favori takım bildirimleri (büyüme raporu 3.1) + ana ekrana ekle (3.2). Profil › Favorilerim'in üstünde.
 * Bildirim: service worker (/sw.js) + Push API aboneliği → /api/push/register (platform "web"). VAPID açık anahtarı
 * yoksa (NEXT_PUBLIC_VAPID_PUBLIC_KEY) ya da tarayıcı desteklemiyorsa bildirim bölümü görünmez.
 */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function WebPushPanel() {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<'unknown' | 'on' | 'off' | 'denied'>('unknown');
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const ok = !!VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) {
      if (Notification.permission === 'denied') setState('denied');
      else
        navigator.serviceWorker.getRegistration('/sw.js').then(async (reg) => {
          const sub = await reg?.pushManager.getSubscription();
          setState(sub ? 'on' : 'off');
        });
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource }));
      const res = await fetch('/api/push/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: JSON.stringify(sub), platform: 'web' }) });
      setState(res.ok ? 'on' : 'off');
    } catch {
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/register', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: JSON.stringify(sub) }) });
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  if (!supported && !install) return null;
  return (
    <section className={styles.panel} aria-labelledby="bildirimler">
      <h2 id="bildirimler" className={styles.title}>
        Bildirimler
      </h2>
      {supported ? (
        <div className={styles.row}>
          <p className={styles.text}>Favori takımlarının golleri ve resmî kadroları açıklanınca anında haber al.</p>
          {state === 'on' ? (
            <button type="button" className={styles.ghost} onClick={() => void disable()} disabled={busy}>
              Bildirimleri kapat
            </button>
          ) : state === 'denied' ? (
            <span className={styles.note}>Tarayıcı ayarlarından bildirim iznini açman gerekiyor.</span>
          ) : (
            <button type="button" className={styles.btn} onClick={() => void enable()} disabled={busy || state === 'unknown'}>
              Bildirimleri aç
            </button>
          )}
        </div>
      ) : null}
      {install ? (
        <div className={styles.row}>
          <p className={styles.text}>Scor3&apos;ü ana ekranına ekle: uygulama gibi tek dokunuşla aç.</p>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              void install.prompt();
              setInstall(null);
            }}
          >
            Ana ekrana ekle
          </button>
        </div>
      ) : null}
    </section>
  );
}
