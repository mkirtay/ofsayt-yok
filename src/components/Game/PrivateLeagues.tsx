/**
 * Tahmin Ligi özel ligleri (büyüme raporu 2.2): "Liglerim" paneli (kur / kodla katıl / liste) ve lig sayfası
 * (sezon + hafta sıralaması, WhatsApp davet linki, kopyala, katıl / ayrıl). Sunucu: server/game/leagues.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { GAME_BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import styles from './leagues.module.scss';
import { trackGrowth } from '@/lib/growthEvents';

type Summary = { id: string; name: string; code: string; owner: boolean; members: number };
type Row = { userId: string; nickname: string; points: number; exact: number; direction: number };
type View = {
  id: string;
  name: string;
  code: string;
  members: number;
  member: boolean;
  owner: boolean;
  season: { key: string; rows: Row[] };
  week: { key: string; rows: Row[] } | null;
};

export const leaguePath = (code: string) => `${GAME_BRAND.basePath}/lig/${code}`;
export function inviteText(name: string, url: string): string {
  return `"${name}" Tahmin Ligi'ne katıl: haftanın maçlarının skorunu tahmin et, aramızdaki sıralamada yarışalım. Ücretsiz. ${url}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: body as T } : { ok: false, error: (body as { error?: string }).error ?? 'Bir sorun oluştu.' };
  } catch {
    return { ok: false, error: 'Bağlantı hatası.' };
  }
}

function SignInPrompt({ next }: { next: string }) {
  return (
    <p className={styles.muted}>
      Lig kurmak ya da katılmak için{' '}
      <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(next)}`}>giriş yap</Link> ya da{' '}
      <Link href={`/auth/signup?callbackUrl=${encodeURIComponent(next)}`}>ücretsiz üye ol</Link>.
    </p>
  );
}

export function MyLeagues() {
  const { status } = useSession();
  const router = useRouter();
  const [leagues, setLeagues] = useState<Summary[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await call<{ leagues: Summary[] }>('/api/game/leagues');
    setLeagues(r.ok ? r.data.leagues : []);
  }, []);
  useEffect(() => {
    if (status === 'authenticated') void load();
  }, [status, load]);

  if (status === 'unauthenticated') return <SignInPrompt next={`${GAME_BRAND.basePath}/ligler`} />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await call<{ league: Summary }>('/api/game/leagues', { method: 'POST', body: JSON.stringify({ name }) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    trackGrowth('league_create', {});
    void router.push(leaguePath(r.data.league.code));
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await call<{ league: Summary }>('/api/game/leagues/join', { method: 'POST', body: JSON.stringify({ code }) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    trackGrowth('league_join', {});
    void router.push(leaguePath(r.data.league.code));
  };

  return (
    <div className={styles.stack}>
      {leagues?.length ? (
        <section className={styles.card} aria-labelledby="liglerim">
          <h2 id="liglerim" className={styles.h2}>
            Liglerim
          </h2>
          <ul className={styles.list}>
            {leagues.map((l) => (
              <li key={l.id}>
                <Link href={leaguePath(l.code)} className={styles.listLink}>
                  <span className={styles.name}>{l.name}</span>
                  <span className={styles.meta}>
                    {l.members} üye{l.owner ? ' · kurucu' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={create}>
          <h2 className={styles.h2}>Lig kur</h2>
          <p className={styles.muted}>Arkadaş ya da ofis ligi: davet linkini paylaş, haftalık ve sezonluk aranızda sıralama.</p>
          <label className={styles.label} htmlFor="lig-adi">
            Lig adı
          </label>
          <input id="lig-adi" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="ör. Ofis Ligi" />
          <button type="submit" className={styles.btn} disabled={busy || name.trim().length < 3}>
            Ligi kur
          </button>
        </form>
        <form className={styles.card} onSubmit={join}>
          <h2 className={styles.h2}>Koda katıl</h2>
          <p className={styles.muted}>Arkadaşının gönderdiği 8 karakterlik kodu gir.</p>
          <label className={styles.label} htmlFor="lig-kodu">
            Davet kodu
          </label>
          <input
            id="lig-kodu"
            className={styles.input}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoCapitalize="characters"
            placeholder="ABCD2345"
          />
          <button type="submit" className={styles.btn} disabled={busy || code.trim().length !== 8}>
            Katıl
          </button>
        </form>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Standings({ rows, me }: { rows: Row[]; me: string | null }) {
  if (!rows.length) return <p className={styles.muted}>Henüz üye yok.</p>;
  return (
    <ol className={styles.table}>
      {rows.map((r, i) => (
        <li key={r.userId} className={r.userId === me ? styles.me : undefined}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.name}>{r.nickname}</span>
          <span className={styles.meta}>
            {r.exact} tam skor · {r.direction} yön
          </span>
          <span className={styles.points}>{r.points}</span>
        </li>
      ))}
    </ol>
  );
}

export function LeagueView({ code }: { code: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [view, setView] = useState<View | null | 'missing'>(null);
  const [tab, setTab] = useState<'week' | 'season'>('week');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const me = (session?.user as { id?: string } | undefined)?.id ?? null;

  const load = useCallback(async () => {
    const r = await call<View>(`/api/game/leagues/${encodeURIComponent(code)}`);
    setView(r.ok ? r.data : 'missing');
  }, [code]);
  useEffect(() => {
    if (status !== 'loading') void load();
  }, [status, load]);

  if (view === null) return <p className={styles.muted}>Yükleniyor…</p>;
  if (view === 'missing') return <p className={styles.muted}>Lig bulunamadı. Davet kodunu kontrol et.</p>;

  const url = `${siteBaseUrl()}${leaguePath(view.code)}`;
  const text = inviteText(view.name, url);
  const share = async () => {
    trackGrowth('invite_share', { channel: 'league_share' });
    try {
      if (navigator.share) {
        await navigator.share({ title: view.name, text: inviteText(view.name, '').trim(), url });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNote('Davet linki kopyalandı.');
    } catch {
      // iptal
    }
  };
  const join = async () => {
    setBusy(true);
    const r = await call('/api/game/leagues/join', { method: 'POST', body: JSON.stringify({ code: view.code }) });
    setBusy(false);
    if (!r.ok) return setNote(r.error);
    void load();
  };
  const leave = async () => {
    if (!window.confirm(view.owner ? 'Kurucusu olduğun lig silinecek. Emin misin?' : 'Ligden ayrılmak istiyor musun?')) return;
    setBusy(true);
    const r = await call(`/api/game/leagues/${encodeURIComponent(view.code)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return setNote(r.error);
    void router.push(`${GAME_BRAND.basePath}/ligler`);
  };
  const rows = tab === 'week' && view.week ? view.week.rows : view.season.rows;

  return (
    <div className={styles.stack}>
      <header className={styles.card}>
        <p className={styles.kicker}>Özel lig · {view.members} üye</p>
        <h1 className={styles.h1}>{view.name}</h1>
        <p className={styles.muted}>
          Davet kodu: <strong className={styles.code}>{view.code}</strong>
        </p>
        <div className={styles.actions}>
          <a className={styles.btnWa} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => trackGrowth('invite_share', { channel: 'league_whatsapp' })}>
            WhatsApp ile davet et
          </a>
          <button type="button" className={styles.btnGhost} onClick={() => void share()}>
            Linki paylaş
          </button>
          {view.member ? null : status === 'authenticated' ? (
            <button type="button" className={styles.btn} onClick={() => void join()} disabled={busy}>
              Lige katıl
            </button>
          ) : (
            <Link className={styles.btn} href={`/auth/signup?callbackUrl=${encodeURIComponent(leaguePath(view.code))}`}>
              Üye ol ve katıl
            </Link>
          )}
        </div>
        {note ? (
          <p className={styles.note} role="status">
            {note}
          </p>
        ) : null}
      </header>

      <section className={styles.card} aria-label="Sıralama">
        <div className={styles.tabs} role="tablist">
          {view.week ? (
            <button type="button" role="tab" aria-selected={tab === 'week'} className={styles.tab} onClick={() => setTab('week')}>
              Bu hafta
            </button>
          ) : null}
          <button type="button" role="tab" aria-selected={tab === 'season' || !view.week} className={styles.tab} onClick={() => setTab('season')}>
            Sezon {view.season.key}
          </button>
        </div>
        <Standings rows={rows} me={me} />
        <p className={styles.muted}>
          Puanlar Tahmin Ligi&apos;ndeki haftalık tahminlerden gelir; ödül yoktur, yalnız sıralama. <Link href={GAME_BRAND.basePath}>Bu haftanın maçlarını tahmin et →</Link>
        </p>
      </section>

      {view.member ? (
        <button type="button" className={styles.leave} onClick={() => void leave()} disabled={busy}>
          {view.owner ? 'Ligi sil' : 'Ligden ayrıl'}
        </button>
      ) : null}
    </div>
  );
}
