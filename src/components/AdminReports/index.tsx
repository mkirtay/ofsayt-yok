import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from './adminReports.module.scss';

/**
 * Yönetici şikâyet kuyruğu — açık şikâyetler (hedef başına, en eski önce), içerik önizlemesi, neden / sayı, işlemler
 * (gizle, geri aç, sil, reddet, uyar, askıya al / kaldır), filtre sözlüğü ekleri, işlem kaydı ve reddedilen içerik
 * sayaçları. Uçlar: /api/admin/moderation/* (requireAdmin + middleware). Yalnız Türkçe (iç araç; diğer yönetici
 * sayfalarıyla aynı). Şikâyet edenlerin kimliği burada da yok.
 */
type QueueItem = {
  targetKey: string;
  targetType: 'POST' | 'COMMENT' | 'USER';
  reportCount: number;
  autoFlags: string[];
  reasons: Record<string, number>;
  notes: string[];
  firstReportedAt: string;
  lastReportedAt: string;
  overdue: boolean;
  content: {
    id: string;
    body: string | null;
    postId: string | null;
    createdAt: string | null;
    deleted: boolean;
    hiddenAt: string | null;
    hiddenReason: string | null;
  } | null;
  author: { id: string; username: string | null; name: string | null; suspendedUntil: string | null } | null;
};
type Stat = { outcome: string; surface: string; category: string; count: number };
type Queue = { items: QueueItem[]; openTargets: number; stats: Stat[]; reviewHours: number; hideThreshold: number };
type Term = { id: string; term: string; level: string; match: string; category: string; createdAt: string };
type LogRow = {
  id: string;
  createdAt: string;
  action: string;
  targetKey: string | null;
  reportCount: number | null;
  note: string | null;
  meta: unknown;
  admin: string | null;
  targetUser: { id: string; username: string | null } | null;
};

const TABS = [
  { id: 'queue', label: 'Kuyruk' },
  { id: 'terms', label: 'Kelime listesi' },
  { id: 'log', label: 'İşlem kaydı' },
  { id: 'stats', label: 'Sayaçlar' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const REASON_LABEL: Record<string, string> = {
  HARASSMENT: 'Hakaret / küfür',
  HATE: 'Nefret söylemi',
  SPAM: 'Spam',
  SEXUAL: 'Müstehcen / şiddet',
  VIOLENCE: 'Şiddet',
  MISINFO: 'Yanıltıcı',
  OTHER: 'Diğer',
};
const TYPE_LABEL = { POST: 'Gönderi', COMMENT: 'Yorum', USER: 'Kullanıcı' } as const;
const ACTION_LABEL: Record<string, string> = {
  HIDE: 'Gizlendi',
  UNHIDE: 'Geri açıldı',
  DELETE: 'Silindi',
  DISMISS: 'Şikâyet reddedildi',
  WARN: 'Uyarıldı',
  SUSPEND: 'Askıya alındı',
  UNSUSPEND: 'Askı kaldırıldı',
  TERM_ADD: 'Terim eklendi',
  TERM_REMOVE: 'Terim silindi',
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const isSuspended = (until: string | null) => until != null && Date.parse(until) > Date.now();
const flagLabel = (f: string) => f.replace(/^AUTO_/, '').toLowerCase().replace(/_/g, ' ');

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

function QueueCard({ item, onAction, busy }: { item: QueueItem; onAction: (body: object, confirm?: string) => void; busy: boolean }) {
  const [note, setNote] = useState('');
  const [days, setDays] = useState('7');
  const c = item.content;
  const a = item.author;
  const isContent = item.targetType !== 'USER';
  const base = { targetKey: item.targetKey, note: note || undefined };
  const viewHref = c?.postId ? `/gundem/${c.postId}` : a ? `/gundem/kullanici/${a.id}` : null;

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.badge}>{TYPE_LABEL[item.targetType]}</span>
        {item.overdue ? <span className={`${styles.badge} ${styles.badgeDanger}`}>Süre aşıldı</span> : null}
        {c?.hiddenAt ? (
          <span className={`${styles.badge} ${styles.badgeWarn}`}>Gizli ({c.hiddenReason === 'REPORTS' ? 'eşik' : 'yönetici'})</span>
        ) : null}
        {c?.deleted ? <span className={styles.badge}>Silinmiş</span> : null}
        <span className={styles.meta}>
          {item.reportCount} şikâyet · ilk {fmt(item.firstReportedAt)}
        </span>
      </div>

      <p className={styles.body}>{c?.body ?? <em>(içerik yok)</em>}</p>

      <div className={styles.meta}>
        Yazar:{' '}
        {a ? (
          <Link href={`/gundem/kullanici/${a.id}`}>{a.username ? `@${a.username}` : (a.name ?? a.id)}</Link>
        ) : (
          '—'
        )}
        {a && isSuspended(a.suspendedUntil) ? ` · askıda (${fmt(a.suspendedUntil)})` : ''}
        {viewHref ? (
          <>
            {' · '}
            <Link href={viewHref}>Aç</Link>
          </>
        ) : null}
      </div>

      {Object.keys(item.reasons).length || item.autoFlags.length ? (
        <ul className={styles.reasons} aria-label="Nedenler">
          {Object.entries(item.reasons).map(([r, n]) => (
            <li key={r}>
              {REASON_LABEL[r] ?? r}: {n}
            </li>
          ))}
          {item.autoFlags.map((f) => (
            <li key={f} className={styles.auto}>
              Otomatik: {flagLabel(f)}
            </li>
          ))}
        </ul>
      ) : null}
      {item.notes.length ? (
        <ul className={styles.notes} aria-label="Şikâyet notları">
          {item.notes.map((n, i) => (
            <li key={i}>“{n}”</li>
          ))}
        </ul>
      ) : null}

      <label className={styles.noteLabel}>
        Yönetici notu (isteğe bağlı, kayda yazılır)
        <input className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>

      <div className={styles.actions}>
        {isContent && !c?.deleted ? (
          c?.hiddenAt ? (
            <button type="button" className={styles.button} disabled={busy} onClick={() => onAction({ ...base, action: 'UNHIDE' })}>
              Geri aç
            </button>
          ) : (
            <button type="button" className={styles.button} disabled={busy} onClick={() => onAction({ ...base, action: 'HIDE' })}>
              Gizle
            </button>
          )
        ) : null}
        {isContent && !c?.deleted ? (
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={busy}
            onClick={() => onAction({ ...base, action: 'DELETE' }, 'İçerik silinsin mi? Geri alınamaz.')}
          >
            Sil
          </button>
        ) : null}
        <button type="button" className={styles.buttonGhost} disabled={busy} onClick={() => onAction({ ...base, action: 'DISMISS' })}>
          Şikâyeti reddet
        </button>
        {a ? (
          <button type="button" className={styles.buttonGhost} disabled={busy} onClick={() => onAction({ ...base, action: 'WARN' })}>
            Kullanıcıyı uyar
          </button>
        ) : null}
        {a ? (
          isSuspended(a.suspendedUntil) ? (
            <button
              type="button"
              className={styles.buttonGhost}
              disabled={busy}
              onClick={() => onAction({ action: 'UNSUSPEND', userId: a.id, note: note || undefined })}
            >
              Askıyı kaldır
            </button>
          ) : (
            <span className={styles.suspend}>
              <label className={styles.srOnly} htmlFor={`days-${item.targetKey}`}>
                Askı süresi
              </label>
              <select id={`days-${item.targetKey}`} className={styles.select} value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="1">1 gün</option>
                <option value="7">7 gün</option>
                <option value="30">30 gün</option>
                <option value="perm">Kalıcı</option>
              </select>
              <button
                type="button"
                className={`${styles.button} ${styles.danger}`}
                disabled={busy}
                onClick={() =>
                  onAction(
                    { ...base, action: 'SUSPEND', days: days === 'perm' ? null : Number(days) },
                    'Kullanıcının Gündem yazma izni kapatılsın mı? (Giriş ve okuma açık kalır.)',
                  )
                }
              >
                Yazmayı kapat
              </button>
            </span>
          )
        ) : null}
      </div>
    </li>
  );
}

export default function AdminReports() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('queue');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState('');
  const [level, setLevel] = useState('BLOCK');
  const [match, setMatch] = useState('prefix');

  const queueQ = useQuery({
    queryKey: ['admin', 'moderation', 'queue'],
    queryFn: () => api<Queue>('/api/admin/moderation/reports'),
    enabled: tab === 'queue' || tab === 'stats',
  });
  const termsQ = useQuery({
    queryKey: ['admin', 'moderation', 'terms'],
    queryFn: () => api<{ terms: Term[] }>('/api/admin/moderation/terms'),
    enabled: tab === 'terms',
  });
  const logQ = useQuery({
    queryKey: ['admin', 'moderation', 'log'],
    queryFn: () => api<{ items: LogRow[] }>('/api/admin/moderation/log'),
    enabled: tab === 'log',
  });
  const queue = queueQ.data ?? null;
  const terms = termsQ.data?.terms ?? [];
  const log = logQ.data?.items ?? [];
  const loadError = (queueQ.error ?? termsQ.error ?? logQ.error) as Error | null;
  const loadQueue = () => qc.invalidateQueries({ queryKey: ['admin', 'moderation', 'queue'] });
  const loadTerms = () => qc.invalidateQueries({ queryKey: ['admin', 'moderation', 'terms'] });

  async function act(body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api('/api/admin/moderation/actions', { method: 'POST', body: JSON.stringify(body) });
      setOk('İşlem kaydedildi.');
      await loadQueue();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addTerm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api('/api/admin/moderation/terms', { method: 'POST', body: JSON.stringify({ term, level, match }) });
      setTerm('');
      setOk('Terim kaydedildi (en geç 1 dakikada tüm sunucularda geçerli).');
      await loadTerms();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTerm(id: string) {
    if (!window.confirm('Terim silinsin mi?')) return;
    setBusy(true);
    try {
      await api(`/api/admin/moderation/terms?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadTerms();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Şikâyetler</h1>
      <p className={styles.lead}>
        {queue
          ? `${queue.openTargets} içerikte açık şikâyet. Hedef: en geç ${queue.reviewHours} saatte karar. ${queue.hideThreshold} farklı kullanıcının şikâyet ettiği içerik otomatik gizlenir.`
          : 'Yükleniyor…'}
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Bölümler">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`.trim()}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className={styles.status}>
        {error || loadError ? <p className={styles.error}>{error ?? loadError?.message}</p> : null}
        {ok ? <p className={styles.ok}>{ok}</p> : null}
      </div>

      {tab === 'queue' ? (
        queue && queue.items.length === 0 ? (
          <p className={styles.lead}>Açık şikâyet yok.</p>
        ) : (
          <ul className={styles.list}>
            {queue?.items.map((item) => <QueueCard key={item.targetKey} item={item} onAction={act} busy={busy} />)}
          </ul>
        )
      ) : null}

      {tab === 'terms' ? (
        <section className={styles.section}>
          <p className={styles.lead}>
            Temel liste kodda (src/config/moderationTerms.json, testli). Buradan eklenenler onu genişletir: Engelle = AĞIR (reddedilir),
            İşaretle = ORTA (yayınlanır, kuyruğa düşer), İstisna = yanlış pozitif veren kelime (kelimenin tamamı).
          </p>
          <form className={styles.termForm} onSubmit={addTerm}>
            <label className={styles.noteLabel}>
              Terim
              <input className={styles.input} value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} required />
            </label>
            <label className={styles.noteLabel}>
              Seviye
              <select className={styles.select} value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="BLOCK">Engelle (AĞIR)</option>
                <option value="FLAG">İşaretle (ORTA)</option>
                <option value="ALLOW">İstisna</option>
              </select>
            </label>
            <label className={styles.noteLabel}>
              Eşleşme
              <select className={styles.select} value={match} onChange={(e) => setMatch(e.target.value)} disabled={level === 'ALLOW'}>
                <option value="prefix">Kelime başı (ekler dahil)</option>
                <option value="exact">Kelimenin tamamı</option>
                <option value="contains">Kelime içinde (uzun, ayırt edici terim)</option>
              </select>
            </label>
            <button type="submit" className={styles.button} disabled={busy || term.trim().length < 2}>
              Ekle
            </button>
          </form>
          <ul className={styles.termList}>
            {terms.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.term}</strong> · {t.level} · {t.match}
                </span>
                <button type="button" className={styles.buttonGhost} disabled={busy} onClick={() => void removeTerm(t.id)}>
                  Sil
                </button>
              </li>
            ))}
            {terms.length === 0 ? <li className={styles.lead}>Ek terim yok.</li> : null}
          </ul>
        </section>
      ) : null}

      {tab === 'log' ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Zaman</th>
              <th scope="col">Yönetici</th>
              <th scope="col">İşlem</th>
              <th scope="col">Hedef</th>
              <th scope="col">Not</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.createdAt)}</td>
                <td>{r.admin ?? '—'}</td>
                <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td>
                  {r.targetKey ?? ''}
                  {r.targetUser?.username ? ` @${r.targetUser.username}` : ''}
                  {r.reportCount != null ? ` (${r.reportCount} şikâyet)` : ''}
                </td>
                <td>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {tab === 'stats' ? (
        <section className={styles.section}>
          <p className={styles.lead}>Son 30 gün — reddedilen ve işaretlenen içerik (kişisel veri yok; yalnız sayılar).</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Sonuç</th>
                <th scope="col">Yüzey</th>
                <th scope="col">Kategori</th>
                <th scope="col">Sayı</th>
              </tr>
            </thead>
            <tbody>
              {(queue?.stats ?? []).map((s) => (
                <tr key={`${s.outcome}-${s.surface}-${s.category}`}>
                  <td>{s.outcome === 'rejected' ? 'Reddedildi' : 'İşaretlendi'}</td>
                  <td>{s.surface}</td>
                  <td>{s.category}</td>
                  <td>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
