import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import styles from './adminUsers.module.scss';

/**
 * Yönetici paneli — kullanıcı arama, tüm kullanıcılar listesi (en yeni üstte, 50'şer), kredi ± (gerekçe zorunlu, denetim
 * izine yazılır), kredi hareketleri. Premium sistemi kaldırıldı: arayüzde premium yok (eski API ucu dokunulmadı).
 * Uçlar: /api/admin/users… (requireAdmin + middleware). Yalnız Türkçe (iç araç).
 */
type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string;
  credits: number;
  emailVerified: string | null;
  createdAt: string;
};
/** Liste satırı (GET /api/admin/users, q yok). */
type ListUser = AdminUser & { termsAcceptedAt: string | null; gundemSuspended: boolean; gundemSuspendedUntil: string | null };
type ListPage = { users: ListUser[]; nextCursor: string | null };
type Tx = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  matchId: string | null;
  note: string | null;
  status: string | null;
  actorId: string | null;
  createdAt: string;
};
type Detail = { user: AdminUser; transactions: Tx[]; unlockCount: number };

const PAGE = 50;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  // Sonuç / hata: aria-live ile duyurulan, kendiliğinden kapanan toast (components/Toast).
  const { show, toastNode } = useToast('Bildirimi kapat');
  const [busy, setBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [amount, setAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['admin', 'users', 'list'],
    queryFn: ({ pageParam }) => api<ListPage>(`/api/admin/users${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const listRows = list.data?.pages.flatMap((p) => p.users) ?? [];

  const search = useCallback(async () => {
    try {
      const r = await api<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
      setUsers(r.users);
    } catch (e) {
      show('error', (e as Error).message);
    }
  }, [q, show]);

  const load = useCallback(async (id: string) => {
    try {
      const d = await api<Detail>(`/api/admin/users/${encodeURIComponent(id)}`);
      setDetail(d);
      setHasOlder(d.transactions.length === PAGE);
    } catch (e) {
      show('error', (e as Error).message);
    }
  }, [show]);

  const loadOlder = async () => {
    if (!detail || detail.transactions.length === 0) return;
    const last = detail.transactions[detail.transactions.length - 1]!;
    setBusy(true);
    try {
      const d = await api<Detail>(`/api/admin/users/${detail.user.id}?before=${encodeURIComponent(last.createdAt)}`);
      setDetail({ ...detail, transactions: [...detail.transactions, ...d.transactions] });
      setHasOlder(d.transactions.length === PAGE);
    } catch (e) {
      show('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const adjustCredits = async (sign: 1 | -1) => {
    if (!detail) return;
    const n = Math.abs(Number(amount));
    if (!window.confirm(`${detail.user.email}: ${sign > 0 ? '+' : '−'}${n} kredi. Onaylıyor musun?`)) return;
    setBusy(true);
    try {
      const r = await api<{ credits: number }>(`/api/admin/users/${detail.user.id}/credits`, {
        method: 'POST',
        body: JSON.stringify({ amount: sign * n, note: creditNote }),
      });
      show('success', `Yeni bakiye: ${r.credits}`);
      setAmount('');
      setCreditNote('');
      await load(detail.user.id);
    } catch (e) {
      show('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const u = detail?.user;
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Kullanıcılar</h1>
      <p className={styles.lead}>Kredi ekle / çıkar (gerekçe zorunlu, eksiye inemez). Her işlem denetim izine yazılır.</p>

      <form
        className={styles.searchRow}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="E-posta, kullanıcı adı ya da id" aria-label="Kullanıcı ara" />
        <button className={styles.button} type="submit" disabled={q.trim().length < 2}>
          Ara
        </button>
      </form>

      {users.length > 0 ? (
        <ul className={styles.results}>
          {users.map((x) => (
            <li key={x.id}>
              <button type="button" className={`${styles.resultItem} ${u?.id === x.id ? styles.resultActive : ''}`} onClick={() => void load(x.id)}>
                <span>
                  {x.email} {x.username ? <span className={styles.meta}>@{x.username}</span> : null}
                </span>
                <span className={styles.meta}>
                  {x.credits} kredi
                  {x.role === 'ADMIN' ? ' · YÖNETİCİ' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section className={styles.listSection} aria-labelledby="all-users-title">
        <h2 id="all-users-title" className={styles.sectionTitle}>
          Tüm kullanıcılar
        </h2>
        {list.isPending ? (
          <p className={styles.meta}>Yükleniyor…</p>
        ) : list.isError ? (
          <p className={styles.error} role="alert">
            {(list.error as Error).message}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Kullanıcı adı</th>
                  <th scope="col">E-posta</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Kredi</th>
                  <th scope="col">Kayıt</th>
                  <th scope="col">E-posta doğrulandı</th>
                  <th scope="col">Şartlar kabulü</th>
                  <th scope="col">Gündem askısı</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((x) => (
                  <tr
                    key={x.id}
                    className={`${styles.listRow} ${u?.id === x.id ? styles.listRowActive : ''}`.trim()}
                    onClick={() => void load(x.id)}
                  >
                    <td>
                      {/* Klavye / ekran okuyucu: satırın asıl denetimi bu düğme (tıklama tüm satırda). */}
                      <button
                        type="button"
                        className={styles.rowButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          void load(x.id);
                        }}
                        aria-label={`Ayrıntıyı aç: ${x.username ?? x.email}`}
                      >
                        {x.username ? `@${x.username}` : '—'}
                      </button>
                    </td>
                    <td>{x.email}</td>
                    <td>{x.role === 'ADMIN' ? 'Yönetici' : 'Üye'}</td>
                    <td>{x.credits}</td>
                    <td>{fmtDay(x.createdAt)}</td>
                    <td>{x.emailVerified ? 'Evet' : 'Hayır'}</td>
                    <td>{fmtDay(x.termsAcceptedAt)}</td>
                    <td>{x.gundemSuspended ? `Askıda (${fmtDay(x.gundemSuspendedUntil)})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.hasNextPage ? (
          <button className={styles.button} type="button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {list.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
          </button>
        ) : null}
      </section>

      {toastNode}

      {u && detail ? (
        <section className={styles.card} aria-label="Kullanıcı ayrıntısı">
          <dl className={styles.facts}>
            <div><dt>E-posta</dt><dd>{u.email}</dd></div>
            <div><dt>Bakiye</dt><dd>{u.credits} kredi</dd></div>
            <div><dt>E-posta doğrulandı</dt><dd>{u.emailVerified ? fmt(u.emailVerified) : 'Hayır'}</dd></div>
            <div><dt>Kayıt</dt><dd>{fmt(u.createdAt)}</dd></div>
            <div><dt>Açılan analiz</dt><dd>{detail.unlockCount}</dd></div>
          </dl>

          <h2 className={styles.sectionTitle}>Kredi</h2>
          <div className={styles.formRow}>
            <input className={styles.input} type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tutar" aria-label="Kredi tutarı" />
            <input className={styles.input} value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="Gerekçe (zorunlu, en az 5 karakter)" aria-label="Kredi gerekçesi" />
            <button className={styles.button} type="button" disabled={busy || !Number(amount) || creditNote.trim().length < 5} onClick={() => void adjustCredits(1)}>
              Ekle
            </button>
            <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={busy || !Number(amount) || creditNote.trim().length < 5} onClick={() => void adjustCredits(-1)}>
              Çıkar
            </button>
          </div>

          <h2 className={styles.sectionTitle}>Kredi hareketleri</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Tarih</th><th>Tür</th><th>Tutar</th><th>Bakiye</th><th>Maç</th><th>Not</th><th>Yönetici</th></tr>
              </thead>
              <tbody>
                {detail.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{fmt(t.createdAt)}</td>
                    <td>{t.type}{t.status ? ` (${t.status})` : ''}</td>
                    <td className={t.amount > 0 ? styles.plus : t.amount < 0 ? styles.minus : undefined}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                    <td>{t.balanceAfter}</td>
                    <td>{t.matchId ?? '—'}</td>
                    <td>{t.note ?? '—'}</td>
                    <td>{t.actorId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasOlder ? (
            <button className={styles.button} type="button" disabled={busy} onClick={() => void loadOlder()}>
              Daha eski hareketler
            </button>
          ) : null}

        </section>
      ) : null}
    </div>
  );
}
