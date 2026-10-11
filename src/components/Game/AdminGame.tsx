import { useCallback, useEffect, useState } from 'react';
import { weekKeyOf, shiftWeek } from '@/lib/game/week';
import { GAME_BRAND } from '@/config/brand';
import type { Suggestion } from '@/server/game/suggestions';
import type { AdminWeekView } from '@/server/game/weeks';
import styles from './game.module.scss';

const WEEK_MATCHES = 5;
const fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Admin: tahmin oyunu hafta oluşturucu. Hafta seç → taslak → aday maçlardan 5 seç (sıra = seçim sırası) → kaydet → yayınla.
 * Yayından sonra maç başına iptal / sonucu düzelt; oyuncuyu sıralamadan gizle; sonuç işini elle çalıştır.
 * Metinler yalnız admin için (TR, çeviri yok).
 */
export default function AdminGame() {
  const [weekKey, setWeekKey] = useState(() => shiftWeek(weekKeyOf(Date.now()), 1)!);
  const [week, setWeek] = useState<AdminWeekView | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [hideUser, setHideUser] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async (key: string, suggest = false) => {
    const d = await api<{ week: AdminWeekView | null; suggestions: Suggestion[] | null }>(`/api/admin/game/weeks/${key}${suggest ? '?suggest=1' : ''}`);
    setWeek(d.week);
    setPicked(d.week?.matches.map((m) => m.fixtureId) ?? []);
    if (suggest) setSuggestions(d.suggestions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ week: AdminWeekView | null }>(`/api/admin/game/weeks/${weekKey}`)
      .then((d) => {
        if (cancelled) return;
        setWeek(d.week);
        setPicked(d.week?.matches.map((m) => m.fixtureId) ?? []);
      })
      .catch((e: unknown) => !cancelled && setMsg(e instanceof Error ? e.message : 'Hata'));
    return () => {
      cancelled = true;
    };
  }, [weekKey]);

  const changeWeek = (n: number) => {
    setWeek(null);
    setPicked([]);
    setSuggestions(null);
    setMsg('');
    setWeekKey((k) => shiftWeek(k, n) ?? k);
  };

  const isDraft = week?.rawStatus === 'DRAFT';
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= WEEK_MATCHES ? p : [...p, id]));

  return (
    <div className={styles.page}>
      <h1 className={styles.h2}>{GAME_BRAND.name} — hafta yönetimi</h1>

      <div className={`${styles.card} ${styles.adminRow}`}>
        <button type="button" className={styles.tab} onClick={() => changeWeek(-1)}>
          ←
        </button>
        <strong>{weekKey}</strong>
        <button type="button" className={styles.tab} onClick={() => changeWeek(1)}>
          →
        </button>
        <span className={styles.muted}>Durum: {week ? `${week.rawStatus} · ${week.entries} oyuncu · ${week.predictions} tahmin` : 'yok'}</span>
        {!week ? (
          <button type="button" className={styles.btn} disabled={busy} onClick={() => void run(async () => {
            await api('/api/admin/game/weeks', { method: 'POST', body: JSON.stringify({ weekKey }) });
            await load(weekKey, true);
          })}>
            Taslak oluştur
          </button>
        ) : null}
        <button type="button" className={styles.btn} disabled={busy} onClick={() => void run(async () => {
          await api('/api/admin/game/settle', { method: 'POST' }).then((r) => setMsg(`Sonuç işi: ${JSON.stringify(r)}`));
          await load(weekKey);
        })}>
          Sonuç işini çalıştır
        </button>
      </div>

      {msg ? <p className={styles.status} role="status">{msg}</p> : null}

      {week ? (
        <section className={styles.section}>
          <h2 className={styles.h2}>Maçlar ({week.matches.length}/{WEEK_MATCHES})</h2>
          <ol className={styles.matches}>
            {week.matches.map((m) => (
              <li key={m.id} className={styles.card}>
                <div className={styles.adminRow}>
                  <strong>{m.home.name} – {m.away.name}</strong>
                  <span className={styles.muted}>{fmt.format(new Date(m.kickoffAt))} · {m.status}{m.result ? ` · ${m.result.home}-${m.result.away}` : ''}</span>
                  {!isDraft ? (
                    <>
                      <input className={styles.adminInput} size={5} placeholder="2-1" value={scores[m.id] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [m.id]: e.target.value }))} />
                      <button type="button" className={styles.tab} disabled={busy} onClick={() => void run(async () => {
                        const mm = /^(\d{1,2})-(\d{1,2})$/.exec((scores[m.id] ?? '').trim());
                        if (!mm) throw new Error('Skor biçimi: 2-1');
                        await api(`/api/admin/game/matches/${m.id}`, { method: 'POST', body: JSON.stringify({ action: 'rescore', home: Number(mm[1]), away: Number(mm[2]) }) });
                        await load(weekKey);
                      })}>
                        Sonucu yaz
                      </button>
                      <button type="button" className={styles.tab} disabled={busy || m.status === 'VOID'} onClick={() => {
                        if (!window.confirm('Maç iptal edilsin mi? Tahminler 0, joker yanar.')) return;
                        void run(async () => {
                          await api(`/api/admin/game/matches/${m.id}`, { method: 'POST', body: JSON.stringify({ action: 'void' }) });
                          await load(weekKey);
                        });
                      }}>
                        İptal et
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {isDraft ? (
            <>
              <div className={styles.adminRow}>
                <button type="button" className={styles.tab} disabled={busy} onClick={() => void run(() => load(weekKey, true))}>
                  Aday maçları getir
                </button>
                <button type="button" className={styles.btn} disabled={busy || picked.length === 0} onClick={() => void run(async () => {
                  const d = await api<{ week: AdminWeekView }>(`/api/admin/game/weeks/${weekKey}`, { method: 'PUT', body: JSON.stringify({ fixtureIds: picked }) });
                  setWeek(d.week);
                  setMsg('Liste kaydedildi.');
                })}>
                  Listeyi kaydet ({picked.length})
                </button>
                <button type="button" className={styles.btn} disabled={busy || week.matches.length !== WEEK_MATCHES} onClick={() => {
                  if (!window.confirm(`${weekKey} yayınlansın mı? Yayından sonra liste değişmez.`)) return;
                  void run(async () => {
                    const d = await api<{ week: AdminWeekView }>(`/api/admin/game/weeks/${weekKey}`, { method: 'POST', body: JSON.stringify({ action: 'publish' }) });
                    setWeek(d.week);
                    setMsg('Yayınlandı.');
                  });
                }}>
                  Yayınla
                </button>
              </div>
              {suggestions ? (
                <div className={styles.card}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Seç</th>
                        <th scope="col">Maç</th>
                        <th scope="col">Lig</th>
                        <th scope="col">Saat (TSİ)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.fixtureId} data-me={picked.includes(s.fixtureId) ? '' : undefined}>
                          <td>
                            <input type="checkbox" checked={picked.includes(s.fixtureId)} onChange={() => toggle(s.fixtureId)} aria-label={`${s.home} – ${s.away}`} />
                            {picked.includes(s.fixtureId) ? ` ${picked.indexOf(s.fixtureId) + 1}` : ''}
                          </td>
                          <td>{s.home} – {s.away}</td>
                          <td>{s.leagueName}</td>
                          <td>{fmt.format(new Date(s.kickoffAt))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <form className={`${styles.card} ${styles.adminRow}`} onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('/api/admin/game/entries', { method: 'POST', body: JSON.stringify({ weekKey, username: hideUser, hidden: true }) });
                setMsg(`${hideUser} sıralamadan gizlendi.`);
              });
            }}>
              <label htmlFor="hide-user">Sıralamadan gizle (kullanıcı adı):</label>
              <input id="hide-user" className={styles.adminInput} value={hideUser} onChange={(e) => setHideUser(e.target.value)} />
              <button type="submit" className={styles.tab} disabled={busy || !hideUser.trim()}>Gizle</button>
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
}
