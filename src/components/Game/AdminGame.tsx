import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dayKeyOf, shiftWeek, weekKeyOf, weekRange } from '@/lib/game/week';
import { GAME_BRAND } from '@/config/brand';
import type { GameMatchView } from '@/lib/game/types';
import type { Suggestion } from '@/server/game/suggestions';
import type { AdminWeekView } from '@/server/game/weeks';
import type { AdminDayView } from '@/server/game/days';
import styles from './game.module.scss';

/** server/game/weeks.ts WEEK_MATCH_COUNT ve server/game/days.ts DAY_MATCH_COUNT ile aynı (istemci paketi sunucu modülünü almasın). */
const WEEK_MATCHES = 10;
const DAY_MATCHES = 3;
const fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' });
const dayLongFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long' });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Hata');

/** "19–25 Ekim" (ay değişiyorsa "28 Eylül – 4 Ekim"). */
export function weekRangeLabel(weekKey: string): string {
  const r = weekRange(weekKey);
  if (!r) return weekKey;
  const last = new Date(r.endsAt.getTime() - 1);
  const a = dayFmt.formatToParts(r.startsAt);
  const b = dayFmt.formatToParts(last);
  const part = (p: Intl.DateTimeFormatPart[], t: string) => p.find((x) => x.type === t)?.value ?? '';
  return part(a, 'month') === part(b, 'month') ? `${part(a, 'day')}–${part(b, 'day')} ${part(b, 'month')}` : `${dayFmt.format(r.startsAt)} – ${dayFmt.format(last)}`;
}

function weekTitle(weekKey: string, current: string): string {
  if (weekKey === current) return 'Bu hafta';
  if (weekKey === shiftWeek(current, -1)) return 'Geçen hafta';
  if (weekKey === shiftWeek(current, 1)) return 'Gelecek hafta';
  return `${Number(weekKey.slice(-2))}. hafta`;
}

/** Düzenleyicideki satır: seçili maç (başlamış / tahmin almışsa çıkarılamaz). */
type Item = { fixtureId: string; home: string; away: string; kickoffAt: string; leagueName?: string; locked?: string | null };

function itemFromMatch(m: GameMatchView, counts: Record<string, number>, nowMs: number): Item {
  const started = m.status !== 'SCHEDULED' || Date.parse(m.kickoffAt) <= nowMs;
  const n = counts[m.id] ?? 0;
  return { fixtureId: m.fixtureId, home: m.home.name, away: m.away.name, kickoffAt: m.kickoffAt, locked: started ? 'başladı' : n > 0 ? `${n} tahmin var` : null };
}

type Msg = { tone: 'ok' | 'error'; text: string } | null;
type MsgFn = (m: Msg) => void;

/**
 * Admin: tahmin oyunu. Liste OTOMATİK (game-settle seçer ve yayınlar: haftalık server/game/autoWeek.ts, günlük days.ts); admin
 * isterse "Listeyi düzenle" → seçili maçlardan çıkar / aday listesinden ekle → "Kaydet ve yayınla" (hafta kilitlenir, cron ezmez;
 * "Otomatiğe bırak" kilidi kaldırır). Sayfayı açmak ya da haftalar arasında gezinmek satır AÇMAZ. Metinler yalnız admin için (TR).
 */
export default function AdminGame() {
  const [nowMs] = useState(() => Date.now());
  const currentWeek = useMemo(() => weekKeyOf(nowMs), [nowMs]);
  const today = useMemo(() => dayKeyOf(nowMs), [nowMs]);
  const [weekKey, setWeekKey] = useState(currentWeek);
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <div className={`${styles.page} ${styles.admin}`}>
      <h1 className={styles.h2}>{GAME_BRAND.name} — yönetim</h1>
      <p className={styles.muted}>
        Maçları sistem kurallarla seçip yayınlıyor (sonuç işi her 10 dakikada). İstersen listeyi değiştirebilirsin; değiştirdiğin hafta artık
        otomatik güncellenmez.
      </p>
      {msg ? (
        <p className={styles.status} data-tone={msg.tone} role="status">
          {msg.text}
        </p>
      ) : null}
      <WeekPanel key={weekKey} weekKey={weekKey} currentWeek={currentWeek} nowMs={nowMs} onNavigate={setWeekKey} onMessage={setMsg} />
      <DayPanel dayKey={today} nowMs={nowMs} onMessage={setMsg} />
      <Maintenance weekKey={weekKey} onMessage={setMsg} />
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'auto' | 'admin' | 'none' | 'closed'; children: ReactNode }) {
  return (
    <span className={styles.statusPill} data-tone={tone}>
      {children}
    </span>
  );
}

function WeekPanel({ weekKey, currentWeek, nowMs, onNavigate, onMessage }: { weekKey: string; currentWeek: string; nowMs: number; onNavigate: (k: string) => void; onMessage: MsgFn }) {
  const [week, setWeek] = useState<AdminWeekView | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const isPast = (weekRange(weekKey)?.endsAt.getTime() ?? 0) <= nowMs;
  const prev = shiftWeek(weekKey, -1) ?? weekKey;
  const next = shiftWeek(weekKey, 1) ?? weekKey;

  const load = useCallback(async () => {
    const d = await api<{ week: AdminWeekView | null }>(`/api/admin/game/weeks/${weekKey}`);
    setWeek(d.week);
  }, [weekKey]);

  useEffect(() => {
    let cancelled = false;
    api<{ week: AdminWeekView | null }>(`/api/admin/game/weeks/${weekKey}`)
      .then((d) => !cancelled && setWeek(d.week))
      .catch((e: unknown) => !cancelled && onMessage({ tone: 'error', text: errText(e) }));
    return () => {
      cancelled = true;
    };
  }, [weekKey, onMessage]);

  const status =
    week === undefined ? null : !week ? (
      <StatusPill tone="none">{isPast ? 'Bu hafta oynanmadı' : weekKey === currentWeek ? 'Henüz seçilmedi · sonuç işi ilk turda seçer' : 'Henüz seçilmedi · hafta başında otomatik seçilir'}</StatusPill>
    ) : week.rawStatus === 'SETTLED' ? (
      <StatusPill tone="closed">Kapandı</StatusPill>
    ) : week.rawStatus === 'DRAFT' ? (
      <StatusPill tone="none">Taslak · yayında değil</StatusPill>
    ) : week.lockedByAdmin ? (
      <StatusPill tone="admin">Admin düzenledi · yayında</StatusPill>
    ) : (
      <StatusPill tone="auto">Otomatik seçildi · yayında</StatusPill>
    );
  const canEdit = week !== undefined && !isPast && week?.rawStatus !== 'SETTLED';

  return (
    <section className={styles.adminPanel} aria-labelledby="admin-week-title">
      <div className={styles.adminHead}>
        <div>
          <h2 id="admin-week-title" className={styles.adminTitle}>
            {weekTitle(weekKey, currentWeek)} · {weekRangeLabel(weekKey)}
          </h2>
          <div className={styles.adminMeta}>
            {status}
            {week ? (
              <span className={styles.muted}>
                {week.matches.length} maç · {week.entries} oyuncu · {week.predictions} tahmin
              </span>
            ) : null}
          </div>
        </div>
        <nav className={styles.adminWeekNav} aria-label="Hafta seç">
          <button type="button" onClick={() => onNavigate(prev)}>
            ‹ {weekRangeLabel(prev)}
          </button>
          {weekKey !== currentWeek ? (
            <button type="button" onClick={() => onNavigate(currentWeek)}>
              Bu hafta
            </button>
          ) : null}
          <button type="button" onClick={() => onNavigate(next)}>
            {weekRangeLabel(next)} ›
          </button>
        </nav>
      </div>

      {editing ? (
        <ListEditor
          max={WEEK_MATCHES}
          initial={week ? week.matches.map((m) => itemFromMatch(m, week.predictionCounts, nowMs)) : []}
          loadCandidates={async () => (await api<{ suggestions: Suggestion[] | null }>(`/api/admin/game/weeks/${weekKey}?suggest=1`)).suggestions ?? []}
          onCancel={() => setEditing(false)}
          onSave={async (ids) => {
            const d = await api<{ week: AdminWeekView }>(`/api/admin/game/weeks/${weekKey}`, { method: 'PUT', body: JSON.stringify({ fixtureIds: ids, publish: true }) });
            setWeek(d.week);
            setEditing(false);
            onMessage({ tone: 'ok', text: 'Kaydedildi ve yayında. Bu hafta artık otomatik güncellenmez (“Otomatiğe bırak” ile geri alınır).' });
          }}
        />
      ) : (
        <>
          {week?.matches.length ? <MatchList matches={week.matches} published={week.rawStatus !== 'DRAFT'} onChanged={load} onMessage={onMessage} /> : null}
          {canEdit ? (
            <div className={styles.adminActions}>
              <button type="button" className={styles.btn} onClick={() => setEditing(true)}>
                {week?.matches.length ? 'Listeyi düzenle' : 'Listeyi şimdi seç'}
              </button>
              {week?.lockedByAdmin ? (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() =>
                    void api<{ week: AdminWeekView }>(`/api/admin/game/weeks/${weekKey}`, { method: 'POST', body: JSON.stringify({ action: 'unlock' }) })
                      .then((d) => {
                        setWeek(d.week);
                        onMessage({ tone: 'ok', text: 'Otomatiğe bırakıldı: sonraki turda boş yerler otomatik dolar.' });
                      })
                      .catch((e: unknown) => onMessage({ tone: 'error', text: errText(e) }))
                  }
                >
                  Otomatiğe bırak
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function DayPanel({ dayKey, nowMs, onMessage }: { dayKey: string; nowMs: number; onMessage: MsgFn }) {
  const [day, setDay] = useState<AdminDayView | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const d = await api<{ day: AdminDayView | null }>(`/api/admin/game/days/${dayKey}`);
    setDay(d.day);
  }, [dayKey]);

  useEffect(() => {
    let cancelled = false;
    api<{ day: AdminDayView | null }>(`/api/admin/game/days/${dayKey}`)
      .then((d) => !cancelled && setDay(d.day))
      .catch((e: unknown) => !cancelled && onMessage({ tone: 'error', text: errText(e) }));
    return () => {
      cancelled = true;
    };
  }, [dayKey, onMessage]);

  return (
    <section className={styles.adminPanel} aria-labelledby="admin-day-title">
      <div className={styles.adminHead}>
        <div>
          <h2 id="admin-day-title" className={styles.adminTitle}>
            Bugün · Günün 3 maçı · {dayLongFmt.format(new Date(`${dayKey}T12:00:00Z`))}
          </h2>
          <div className={styles.adminMeta}>
            {day === undefined ? null : day ? (
              <StatusPill tone={day.status === 'SETTLED' ? 'closed' : 'auto'}>{day.status === 'SETTLED' ? 'Kapandı' : 'Yayında'}</StatusPill>
            ) : (
              <StatusPill tone="none">Henüz seçilmedi · sonuç işi ilk turda seçer</StatusPill>
            )}
          </div>
        </div>
      </div>
      {editing ? (
        <ListEditor
          max={DAY_MATCHES}
          initial={day ? day.matches.map((m) => itemFromMatch(m, day.predictionCounts, nowMs)) : []}
          loadCandidates={async () => (await api<{ suggestions: Suggestion[] | null }>(`/api/admin/game/days/${dayKey}?suggest=1`)).suggestions ?? []}
          onCancel={() => setEditing(false)}
          onSave={async (ids) => {
            const d = await api<{ day: AdminDayView }>(`/api/admin/game/days/${dayKey}`, { method: 'PUT', body: JSON.stringify({ fixtureIds: ids }) });
            setDay(d.day);
            setEditing(false);
            onMessage({ tone: 'ok', text: 'Günün 3 maçı kaydedildi ve yayında.' });
          }}
        />
      ) : (
        <>
          {day?.matches.length ? <MatchList matches={day.matches} published onChanged={load} onMessage={onMessage} /> : null}
          {day !== undefined && day?.status !== 'SETTLED' ? (
            <div className={styles.adminActions}>
              <button type="button" className={styles.btn} onClick={() => setEditing(true)}>
                {day?.matches.length ? 'Değiştir' : 'Şimdi seç'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Yayındaki listenin maçları; "İşlemler": sonucu düzelt / iptal et. */
function MatchList({ matches, published, onChanged, onMessage }: { matches: GameMatchView[]; published: boolean; onChanged: () => Promise<void>; onMessage: MsgFn }) {
  const [score, setScore] = useState<Record<string, string>>({});
  const act = (id: string, body: object) =>
    api(`/api/admin/game/matches/${id}`, { method: 'POST', body: JSON.stringify(body) })
      .then(onChanged)
      .then(() => onMessage({ tone: 'ok', text: 'Maç güncellendi.' }))
      .catch((e: unknown) => onMessage({ tone: 'error', text: errText(e) }));
  return (
    <ol className={styles.adminList}>
      {matches.map((m) => (
        <li key={m.id} className={styles.adminItem}>
          <div className={styles.adminItemMain}>
            <strong>
              {m.home.name} – {m.away.name}
            </strong>
            <span className={styles.muted}>
              {fmt.format(new Date(m.kickoffAt))}
              {m.status === 'VOID' ? ' · iptal' : m.result ? ` · ${m.result.home}-${m.result.away}` : ''}
              {m.weekKey && m.dayKey ? ' · haftalık + günlük' : ''}
            </span>
          </div>
          {published && m.status !== 'VOID' ? (
            <details className={styles.adminMore}>
              <summary>İşlemler</summary>
              <div className={styles.adminMoreBody}>
                <input
                  className={styles.adminInput}
                  size={5}
                  placeholder="2-1"
                  aria-label={`${m.home.name} – ${m.away.name}: sonuç (normal süre)`}
                  value={score[m.id] ?? ''}
                  onChange={(e) => setScore((s) => ({ ...s, [m.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className={styles.tab}
                  onClick={() => {
                    const mm = /^(\d{1,2})-(\d{1,2})$/.exec((score[m.id] ?? '').trim());
                    if (!mm) return onMessage({ tone: 'error', text: 'Skor biçimi: 2-1' });
                    void act(m.id, { action: 'rescore', home: Number(mm[1]), away: Number(mm[2]) });
                  }}
                >
                  Sonucu yaz
                </button>
                <button
                  type="button"
                  className={styles.tab}
                  onClick={() => {
                    if (window.confirm('Maç iptal edilsin mi? Tahminler 0, joker yanar.')) void act(m.id, { action: 'void' });
                  }}
                >
                  İptal et
                </button>
              </div>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Liste düzenleyici: üstte seçili maçlar (çıkar), altta aranabilir aday listesi (ekle; ★ = otomatik öneri). Liste boşsa
 * otomatik öneriyle başlar. Tek işlem: "Kaydet ve yayınla".
 */
function ListEditor({ max, initial, loadCandidates, onSave, onCancel }: { max: number; initial: Item[]; loadCandidates: () => Promise<Suggestion[]>; onSave: (ids: string[]) => Promise<void>; onCancel: () => void }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [cands, setCands] = useState<Suggestion[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loader] = useState(() => loadCandidates);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((list) => {
        if (cancelled) return;
        setCands(list);
        // Boş listede otomatik öneriyle başla.
        setItems((cur) =>
          cur.length
            ? cur
            : list
                .filter((s) => s.auto)
                .slice(0, max)
                .map((s) => ({ fixtureId: s.fixtureId, home: s.home, away: s.away, kickoffAt: s.kickoffAt, leagueName: s.leagueName })),
        );
      })
      .catch((e: unknown) => !cancelled && setError(errText(e)));
    return () => {
      cancelled = true;
    };
  }, [loader, max]);

  const selected = new Set(items.map((i) => i.fixtureId));
  const q = query.trim().toLocaleLowerCase('tr');
  const visible = (cands ?? []).filter((c) => !selected.has(c.fixtureId) && (!q || `${c.home} ${c.away} ${c.leagueName}`.toLocaleLowerCase('tr').includes(q)));

  return (
    <div className={styles.editor}>
      <h3 className={styles.editorTitle}>
        Seçili maçlar ({items.length}/{max})
      </h3>
      {items.length ? (
        <ol className={styles.adminList}>
          {items.map((it) => (
            <li key={it.fixtureId} className={styles.adminItem}>
              <div className={styles.adminItemMain}>
                <strong>
                  {it.home} – {it.away}
                </strong>
                <span className={styles.muted}>
                  {fmt.format(new Date(it.kickoffAt))}
                  {it.leagueName ? ` · ${it.leagueName}` : ''}
                </span>
              </div>
              <button
                type="button"
                className={styles.tab}
                disabled={!!it.locked}
                title={it.locked ? `Çıkarılamaz: ${it.locked}` : undefined}
                onClick={() => setItems((cur) => cur.filter((x) => x.fixtureId !== it.fixtureId))}
              >
                {it.locked ? it.locked : 'Çıkar'}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.muted}>{cands ? 'Aday maç yok.' : 'Öneriler yükleniyor…'}</p>
      )}

      <h3 className={styles.editorTitle}>Maç ekle</h3>
      <input className={styles.editorSearch} type="search" placeholder="Takım ya da lig ara" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Aday maçlarda ara" />
      {error ? (
        <p className={styles.status} data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className={styles.candList}>
        {cands === null && !error ? <li className={styles.muted}>Yükleniyor…</li> : null}
        {visible.slice(0, 40).map((c) => (
          <li key={c.fixtureId} className={styles.candRow}>
            <div className={styles.adminItemMain}>
              <span>
                {c.auto ? (
                  <span className={styles.candStar} title="Otomatik öneri">
                    ★{' '}
                  </span>
                ) : null}
                {c.home} – {c.away}
              </span>
              <span className={styles.muted}>
                {fmt.format(new Date(c.kickoffAt))} · {c.leagueName}
              </span>
            </div>
            <button
              type="button"
              className={styles.tab}
              disabled={items.length >= max}
              onClick={() => setItems((cur) => [...cur, { fixtureId: c.fixtureId, home: c.home, away: c.away, kickoffAt: c.kickoffAt, leagueName: c.leagueName }])}
            >
              Ekle
            </button>
          </li>
        ))}
        {cands && !visible.length ? <li className={styles.muted}>{q ? 'Eşleşen maç yok.' : 'Eklenecek başka maç yok.'}</li> : null}
      </ul>

      <div className={styles.editorBar}>
        <button
          type="button"
          className={styles.btn}
          disabled={busy || !items.length}
          onClick={() => {
            setBusy(true);
            setError(null);
            onSave(items.map((i) => i.fixtureId))
              .catch((e: unknown) => setError(errText(e)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Kaydediliyor…' : `Kaydet ve yayınla (${items.length})`}
        </button>
        <button type="button" className={styles.linkBtn} onClick={onCancel} disabled={busy}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/** Bakım: sonuç işini elle çalıştır, oyuncuyu sıralamadan gizle. */
function Maintenance({ weekKey, onMessage }: { weekKey: string; onMessage: MsgFn }) {
  const [hideUser, setHideUser] = useState('');
  return (
    <details className={styles.adminPanel}>
      <summary className={styles.adminTitle}>Bakım</summary>
      <div className={styles.adminActions}>
        <button
          type="button"
          className={styles.tab}
          onClick={() =>
            void api<Record<string, number>>('/api/admin/game/settle', { method: 'POST' })
              .then((r) =>
                onMessage({
                  tone: 'ok',
                  text: `Sonuç işi çalıştı: ${r.evaluated ?? 0} maç sonuçlandı, ${r.voided ?? 0} iptal, haftaya ${r.weekAdded ?? 0} maç eklendi${r.dayCreated ? ', günün maçları seçildi' : ''}${r.errors ? ` · ${r.errors} hata` : ''}. Sayfayı yenileyince görünür.`,
                }),
              )
              .catch((e: unknown) => onMessage({ tone: 'error', text: errText(e) }))
          }
        >
          Sonuç işini şimdi çalıştır
        </button>
      </div>
      <form
        className={styles.adminActions}
        onSubmit={(e) => {
          e.preventDefault();
          void api('/api/admin/game/entries', { method: 'POST', body: JSON.stringify({ weekKey, username: hideUser, hidden: true }) })
            .then(() => onMessage({ tone: 'ok', text: `${hideUser} bu haftanın sıralamasından gizlendi.` }))
            .catch((err: unknown) => onMessage({ tone: 'error', text: errText(err) }));
        }}
      >
        <label htmlFor="hide-user">Sıralamadan gizle (kullanıcı adı):</label>
        <input id="hide-user" className={styles.adminInput} value={hideUser} onChange={(e) => setHideUser(e.target.value)} />
        <button type="submit" className={styles.tab} disabled={!hideUser.trim()}>
          Gizle
        </button>
      </form>
    </details>
  );
}
