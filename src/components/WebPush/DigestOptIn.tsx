import { useEffect, useState } from 'react';
import styles from './webPush.module.scss';

/** Haftalık e-posta özeti açık izni (büyüme raporu 3.3) — kutu işaretlenmeden izin yok (varsayılan kapalı). */

export default function DigestOptIn() {
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/user/digest')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { optIn: boolean } | null) => setOptIn(d?.optIn ?? false))
      .catch(() => setOptIn(false));
  }, []);
  if (optIn === null) return null;
  const change = async (next: boolean) => {
    setBusy(true);
    try {
      const r = await fetch('/api/user/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optIn: next }) });
      if (r.ok) setOptIn(((await r.json()) as { optIn: boolean }).optIn);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={optIn} disabled={busy} onChange={(e) => void change(e.target.checked)} />
      <span>
        Haftalık e-posta özeti almak istiyorum: favori takımlarımın haftalık maçları ve AI isabet özeti. İstediğim zaman
        e-postadaki bağlantıyla çıkabilirim.
      </span>
    </label>
  );
}
