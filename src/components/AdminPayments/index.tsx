import { useEffect, useState } from 'react';
import type { AdminPaymentRow } from '@/server/payments/paymentOrders';
import styles from '@/components/AdminUsers/adminUsers.module.scss';

const STATUS_LABEL: Record<string, string> = { PENDING: 'Bekliyor', PAID: 'Ödendi', FAILED: 'Başarısız', REFUNDED: 'İade' };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** Yönetici: son 50 Hikie ödemesi (yalnız okuma). */
export default function AdminPayments() {
  const [rows, setRows] = useState<AdminPaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/payments', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { payments: AdminPaymentRow[] };
      })
      .then((d) => !cancelled && setRows(d.payments))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Hata'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Son ödemeler</h1>
      {error ? <p className={styles.minus}>Yüklenemedi: {error}</p> : null}
      {rows == null && !error ? <p className={styles.lead}>Yükleniyor…</p> : null}
      {rows && rows.length === 0 ? <p className={styles.lead}>Henüz ödeme yok.</p> : null}
      {rows && rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Oluşturma</th>
                <th>Kullanıcı</th>
                <th>Paket</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Ödeme / iade</th>
                <th>Hikie no</th>
                <th>Sipariş no</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.createdAt)}</td>
                  <td>{r.user.username ? `@${r.user.username}` : r.user.email}</td>
                  <td>{r.packageKey}</td>
                  <td>{r.amountTRY} TL</td>
                  <td className={r.status === 'PAID' ? styles.plus : r.status === 'PENDING' ? undefined : styles.minus}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </td>
                  <td>{r.refundedAt ? `İade ${fmt(r.refundedAt)}` : fmt(r.paidAt)}</td>
                  <td>{r.hikieOrderId ?? '—'}</td>
                  <td>{r.merchantOrderId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
