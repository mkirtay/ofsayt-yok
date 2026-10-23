import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import type { AdminCoupon } from '@/lib/coupons';
import styles from '../AdminUsers/adminUsers.module.scss';

/** Yönetici paneli — kupon oluştur (kod, kredi, isteğe bağlı toplam sınır ve bitiş), aç / kapat, kullanım sayıları. Yalnız Türkçe (iç araç). */
async function api<T>(init?: RequestInit): Promise<T> {
  const res = await fetch('/api/admin/coupons', { ...init, headers: { 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

export default function AdminCoupons() {
  const qc = useQueryClient();
  const { show, toastNode } = useToast('Bildirimi kapat');
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState('10');
  const [max, setMax] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const list = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => api<{ coupons: AdminCoupon[] }>() });

  const create = useMutation({
    mutationFn: () => api<{ coupon: AdminCoupon }>({ method: 'POST', body: JSON.stringify({ code, credits, maxRedemptions: max, expiresAt: expires, note }) }),
    onSuccess: ({ coupon }) => {
      show('success', `${coupon.code} oluşturuldu (+${coupon.credits} kredi).`);
      setCode('');
      setMax('');
      setExpires('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
    onError: (e: Error) => show('error', e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => api({ method: 'PATCH', body: JSON.stringify(v) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
    onError: (e: Error) => show('error', e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!create.isPending) create.mutate();
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Kuponlar</h1>
      <p className={styles.lead}>Her kupon kullanıcı başına bir kez geçerli. Kredi oluşturulduktan sonra değiştirilmez; değiştirmek için kapatıp yeni kod aç.</p>

      <form onSubmit={submit} className={styles.listSection}>
        <div className={styles.searchRow}>
          <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Kod (ör. FUTBOL10)" maxLength={32} aria-label="Kupon kodu" autoComplete="off" />
          <input className={styles.input} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="Kredi" inputMode="numeric" aria-label="Kredi" style={{ maxWidth: 100 }} />
        </div>
        <div className={styles.searchRow}>
          <input className={styles.input} value={max} onChange={(e) => setMax(e.target.value)} placeholder="Toplam kullanım sınırı (boş = sınırsız)" inputMode="numeric" aria-label="Toplam kullanım sınırı" />
          <input className={styles.input} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Bitiş tarihi" style={{ maxWidth: 170 }} />
        </div>
        <div className={styles.searchRow}>
          <input className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (ör. Kubilay ile iş birliği)" maxLength={200} aria-label="Not" />
          <button type="submit" className={styles.button} disabled={create.isPending || !code.trim()}>
            {create.isPending ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      </form>

      {list.isError ? <p>Kuponlar yüklenemedi.</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Kod</th><th>Kredi</th><th>Kullanım</th><th>Bitiş</th><th>Not</th><th>Durum</th></tr>
          </thead>
          <tbody>
            {(list.data?.coupons ?? []).map((c) => {
              const expired = c.expiresAt ? new Date(c.expiresAt).getTime() <= Date.now() : false;
              const full = c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions;
              const state = !c.active ? 'Kapalı' : expired ? 'Süresi doldu' : full ? 'Doldu' : 'Aktif';
              return (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong></td>
                  <td>+{c.credits}</td>
                  <td>{c.redeemedCount} / {c.maxRedemptions ?? '∞'}</td>
                  <td>{fmtDay(c.expiresAt)}</td>
                  <td>{c.note ?? '—'}</td>
                  <td>
                    {state}{' '}
                    <button type="button" className={styles.button} style={{ padding: '2px 10px' }} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>
                      {c.active ? 'Kapat' : 'Aç'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {list.data && list.data.coupons.length === 0 ? <tr><td colSpan={6}>Henüz kupon yok.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {toastNode}
    </main>
  );
}
