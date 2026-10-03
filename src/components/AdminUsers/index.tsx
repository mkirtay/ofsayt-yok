import { useCallback, useState } from 'react';
import styles from './adminUsers.module.scss';

/**
 * Yönetici paneli — kullanıcı arama, kredi ± (gerekçe zorunlu), premium ver / kaldır, kredi hareketleri.
 * Uçlar: /api/admin/users… (requireAdmin + middleware). Yalnız Türkçe (iç araç).
 */
type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string;
  credits: number;
  premiumUntil: string | null;
  emailVerified: string | null;
  createdAt: string;
};
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
type Grant = { id: string; until: string | null; source: string; actorId: string | null; note: string | null; createdAt: string };
type Detail = { user: AdminUser; transactions: Tx[]; premiumGrants: Grant[]; unlockCount: number };

const PAGE = 50;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const isPremium = (u: AdminUser) => u.premiumUntil != null && Date.parse(u.premiumUntil) > Date.now();

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [amount, setAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [premiumChoice, setPremiumChoice] = useState('1');
  const [customUntil, setCustomUntil] = useState('');
  const [premiumNote, setPremiumNote] = useState('');

  const search = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
      setUsers(r.users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q]);

  const load = useCallback(async (id: string) => {
    setError(null);
    setOk(null);
    try {
      const d = await api<Detail>(`/api/admin/users/${encodeURIComponent(id)}`);
      setDetail(d);
      setHasOlder(d.transactions.length === PAGE);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadOlder = async () => {
    if (!detail || detail.transactions.length === 0) return;
    const last = detail.transactions[detail.transactions.length - 1]!;
    setBusy(true);
    try {
      const d = await api<Detail>(`/api/admin/users/${detail.user.id}?before=${encodeURIComponent(last.createdAt)}`);
      setDetail({ ...detail, transactions: [...detail.transactions, ...d.transactions] });
      setHasOlder(d.transactions.length === PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const adjustCredits = async (sign: 1 | -1) => {
    if (!detail) return;
    const n = Math.abs(Number(amount));
    if (!window.confirm(`${detail.user.email}: ${sign > 0 ? '+' : '−'}${n} kredi. Onaylıyor musun?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ credits: number }>(`/api/admin/users/${detail.user.id}/credits`, {
        method: 'POST',
        body: JSON.stringify({ amount: sign * n, note: creditNote }),
      });
      setOk(`Yeni bakiye: ${r.credits}`);
      setAmount('');
      setCreditNote('');
      await load(detail.user.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setPremium = async (remove: boolean) => {
    if (!detail) return;
    const until = remove ? null : premiumChoice === 'custom' ? new Date(customUntil).toISOString() : addMonths(Number(premiumChoice));
    if (!window.confirm(remove ? `${detail.user.email}: premium kaldırılsın mı?` : `${detail.user.email}: premium bitişi ${fmt(until)}. Onaylıyor musun?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/users/${detail.user.id}/premium`, { method: 'POST', body: JSON.stringify({ until, note: premiumNote }) });
      setOk(remove ? 'Premium kaldırıldı.' : 'Premium verildi.');
      setPremiumNote('');
      await load(detail.user.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const u = detail?.user;
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Kullanıcılar</h1>
      <p className={styles.lead}>Kredi ekle / çıkar (gerekçe zorunlu, eksiye inemez), premium ver / kaldır. Her işlem denetim izine yazılır.</p>

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
                  {x.credits} kredi{isPremium(x) ? ' · PREMIUM' : ''}
                  {x.role === 'ADMIN' ? ' · YÖNETİCİ' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      {u && detail ? (
        <section className={styles.card} aria-label="Kullanıcı ayrıntısı">
          <dl className={styles.facts}>
            <div><dt>E-posta</dt><dd>{u.email}</dd></div>
            <div><dt>Bakiye</dt><dd>{u.credits} kredi</dd></div>
            <div><dt>Premium bitişi</dt><dd>{isPremium(u) ? fmt(u.premiumUntil) : 'Yok'}</dd></div>
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

          <h2 className={styles.sectionTitle}>Premium</h2>
          <div className={styles.formRow}>
            <select className={styles.select} value={premiumChoice} onChange={(e) => setPremiumChoice(e.target.value)} aria-label="Premium süresi">
              <option value="1">Bugünden itibaren 1 ay</option>
              <option value="12">Bugünden itibaren 1 yıl</option>
              <option value="custom">Tarih seç</option>
            </select>
            {premiumChoice === 'custom' ? (
              <input className={styles.input} type="datetime-local" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} aria-label="Premium bitişi" />
            ) : null}
            <input className={styles.input} value={premiumNote} onChange={(e) => setPremiumNote(e.target.value)} placeholder="Not (zorunlu, en az 5 karakter)" aria-label="Premium notu" />
            <button className={styles.button} type="button" disabled={busy || premiumNote.trim().length < 5 || (premiumChoice === 'custom' && !customUntil)} onClick={() => void setPremium(false)}>
              Premium ver
            </button>
            <button className={`${styles.button} ${styles.buttonDanger}`} type="button" disabled={busy || premiumNote.trim().length < 5 || !isPremium(u)} onClick={() => void setPremium(true)}>
              Kaldır
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

          {detail.premiumGrants.length > 0 ? (
            <>
              <h2 className={styles.sectionTitle}>Premium geçmişi</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Tarih</th><th>Bitiş</th><th>Kaynak</th><th>Not</th><th>Yönetici</th></tr>
                  </thead>
                  <tbody>
                    {detail.premiumGrants.map((g) => (
                      <tr key={g.id}>
                        <td>{fmt(g.createdAt)}</td>
                        <td>{g.until ? fmt(g.until) : 'Kaldırıldı'}</td>
                        <td>{g.source}</td>
                        <td>{g.note ?? '—'}</td>
                        <td>{g.actorId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
