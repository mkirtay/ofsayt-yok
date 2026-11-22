import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import styles from './teamPassCard.module.scss';

type Info = { cost: number; season: string; passes: { teamId: number }[] };

/**
 * "Takımım" sezon paketi kartı (büyüme raporu 2.8): takım sayfasında (yalnız Süper Lig, bayrak açıkken). Krediyle bir
 * kez: bu sezon takımın hazır AI analizleri kilitsiz. Yetersiz krediyse kredi sayfasına bağlantı.
 */
export default function TeamPassCard({ teamId, teamName }: { teamId: number; teamName: string }) {
  const { status } = useSession();
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string; buy?: boolean } | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/credits/team-pass')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Info | null) => !cancelled && setInfo(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  const owned = !!info?.passes.some((p) => p.teamId === teamId);
  const buy = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/credits/team-pass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setInfo((i) => (i ? { ...i, passes: [...i.passes, { teamId }] } : i));
        setMsg({ tone: 'ok', text: `${teamName} sezon paketi açıldı. Bu sezonun hazır AI analizleri artık sana açık.` });
      } else setMsg({ tone: 'err', text: body.error ?? 'Bir sorun oluştu.', buy: body.code === 'INSUFFICIENT_CREDITS' });
    } catch {
      setMsg({ tone: 'err', text: 'Bağlantı hatası.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="takimim-paket">
      <div>
        <p className={styles.kicker}>Takımım · sezon paketi</p>
        <h2 id="takimim-paket" className={styles.title}>
          {teamName}: bu sezonki tüm AI analizleri
        </h2>
        <p className={styles.text}>
          Süper Lig ve Avrupa maçlarının maç öncesi analizleri her maçta ayrı kredi harcamadan açılır. Tek seferlik; abonelik
          yok.
        </p>
      </div>
      <div className={styles.side}>
        {owned ? (
          <span className={styles.owned}>✓ Paket sende ({info?.season})</span>
        ) : status === 'authenticated' ? (
          <button type="button" className={styles.btn} onClick={() => void buy()} disabled={busy || !info}>
            {info ? `${info.cost} krediyle aç` : 'Yükleniyor…'}
          </button>
        ) : (
          <Link className={styles.btn} href={`/auth/signup?callbackUrl=${encodeURIComponent(`/teams/${teamId}`)}`}>
            Üye ol ve aç
          </Link>
        )}
        {msg ? (
          <p className={msg.tone === 'ok' ? styles.ok : styles.err} role="status">
            {msg.text}
            {msg.buy ? (
              <>
                {' '}
                <Link href="/pricing">Kredi al →</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
