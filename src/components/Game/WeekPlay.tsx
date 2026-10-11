import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import { useNow } from '@/hooks/useNow';
import TeamLogo from '@/components/TeamLogo';
import { GAME_BRAND } from '@/config/brand';
import { MAX_GOALS } from '@/lib/game/scoring';
import type { DistributionView, GameMatchView, GameWeekView, MyWeekView, SaveResult } from '@/lib/game/types';
import { formatKickoff, formatLeft, weekNumber } from './format';
import styles from './game.module.scss';

type Pick = { home: number | null; away: number | null };
type Draft = Record<string, Pick>;
type Status = { tone: 'ok' | 'error' | 'info'; text: string } | null;

const draftKey = (weekKey: string) => `game:draft:${weekKey}`;

function readDraft(weekKey: string): { picks: Draft; joker?: string | null } | null {
  try {
    const raw = window.localStorage.getItem(draftKey(weekKey));
    return raw ? (JSON.parse(raw) as { picks: Draft; joker?: string | null }) : null;
  } catch {
    return null;
  }
}

function writeDraft(weekKey: string, value: { picks: Draft; joker?: string | null } | null) {
  try {
    if (value) window.localStorage.setItem(draftKey(weekKey), JSON.stringify(value));
    else window.localStorage.removeItem(draftKey(weekKey));
  } catch {
    /* gizli pencere vb. — taslak tutulmaz */
  }
}

function isLocked(m: GameMatchView, now: number | null): boolean {
  if (m.status !== 'SCHEDULED') return true;
  return now != null && now >= Date.parse(m.kickoffAt);
}

/**
 * Haftanın 5 maçı: skor girişleri (+/–), joker, kalan süre, sonuç ve puan kırılımı. Kilit SUNUCUDA (veritabanı saati); buradaki
 * kilit yalnız görünüm. Girişsiz kullanıcı da doldurabilir: taslak tarayıcıda tutulur, kaydetmede Google girişine gider ve
 * dönüşte geri yüklenir. Takma ad yoksa satır içi form (Frikik ile aynı PATCH /api/user/me).
 */
export default function WeekPlay({ week, prevKey, nextKey }: { week: GameWeekView; prevKey?: string | null; nextKey?: string | null }) {
  const { t } = useTranslation('game');
  const { locale } = useI18n();
  const { status: authStatus, update: updateSession } = useSession();
  const now = useNow(30_000);
  const [me, setMe] = useState<MyWeekView | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [joker, setJoker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [needNick, setNeedNick] = useState(false);
  const [nick, setNick] = useState('');
  const [nickError, setNickError] = useState<string | null>(null);
  const [dist, setDist] = useState<Record<string, DistributionView>>({});

  const applyMe = useCallback(
    (m: MyWeekView) => {
      setMe(m);
      const picks: Draft = {};
      for (const p of m.predictions) picks[p.gameMatchId] = { home: p.home, away: p.away };
      const local = readDraft(week.weekKey);
      // Kaydedilmemiş taslak (ör. girişten dönüş) sunucudakinin üstüne — yalnız hâlâ açık maçlar için.
      if (local) for (const [id, p] of Object.entries(local.picks)) if (week.matches.some((mm) => mm.id === id && !isLocked(mm, Date.now()))) picks[id] = p;
      setDraft(picks);
      setJoker(local?.joker !== undefined ? local.joker : m.jokerGameMatchId);
    },
    [week],
  );

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (authStatus !== 'authenticated') {
      // Girişsiz taslak tarayıcıda; mount sonrası (SSR HTML'iyle uyuşmazlık olmasın) okunur.
      let cancelled = false;
      void Promise.resolve().then(() => {
        const local = cancelled ? null : readDraft(week.weekKey);
        if (local) {
          setDraft(local.picks);
          setJoker(local.joker ?? null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    fetch(`/api/game/weeks/${week.weekKey}/me`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<MyWeekView>) : null))
      .then((m) => {
        if (!cancelled && m) applyMe(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authStatus, week.weekKey, applyMe]);

  // Başlamış maçların topluluk dağılımı (kilit sonrası açık).
  const startedIds = useMemo(() => week.matches.filter((m) => m.status !== 'VOID' && isLocked(m, now)).map((m) => m.id), [week.matches, now]);
  useEffect(() => {
    for (const id of startedIds) {
      if (dist[id]) continue;
      fetch(`/api/game/matches/${id}/distribution`)
        .then((r) => (r.ok ? (r.json() as Promise<DistributionView>) : null))
        .then((d) => d && setDist((prev) => ({ ...prev, [id]: d })))
        .catch(() => {});
    }
  }, [startedIds, dist]);

  const saved = useMemo(() => new Map(me?.predictions.map((p) => [p.gameMatchId, p]) ?? []), [me]);
  const dirtyItems = week.matches.filter((m) => {
    const d = draft[m.id];
    if (!d || d.home == null || d.away == null || isLocked(m, now)) return false;
    const s = saved.get(m.id);
    return !s || s.home !== d.home || s.away !== d.away;
  });
  const jokerDirty = (me?.jokerGameMatchId ?? null) !== joker;
  const dirty = dirtyItems.length > 0 || jokerDirty;
  const open = week.status === 'PUBLISHED' && week.matches.some((m) => !isLocked(m, now));

  const setGoal = (id: string, side: 'home' | 'away', value: number | null) => {
    setStatus(null);
    setDraft((prev) => {
      const cur = prev[id] ?? { home: null, away: null };
      const next = { ...prev, [id]: { ...cur, [side]: value == null ? null : Math.max(0, Math.min(MAX_GOALS, value)) } };
      if (authStatus !== 'authenticated') writeDraft(week.weekKey, { picks: next, joker });
      return next;
    });
  };

  const toggleJoker = (id: string) => {
    setStatus(null);
    const next = joker === id ? null : id;
    setJoker(next);
    if (authStatus !== 'authenticated') writeDraft(week.weekKey, { picks: draft, joker: next });
  };

  const save = async () => {
    if (authStatus !== 'authenticated') {
      writeDraft(week.weekKey, { picks: draft, joker });
      void signIn('google', { callbackUrl: `${GAME_BRAND.basePath}#hafta` });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const body = {
        items: dirtyItems.map((m) => ({ gameMatchId: m.id, home: draft[m.id]!.home!, away: draft[m.id]!.away! })),
        ...(jokerDirty ? { jokerGameMatchId: joker } : {}),
      };
      const res = await fetch(`/api/game/weeks/${week.weekKey}/predictions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<SaveResult> & { code?: string };
      if (res.status === 403 && data.code === 'NICKNAME_REQUIRED') {
        setNeedNick(true);
        return;
      }
      if (!res.ok || !data.me) {
        setStatus({ tone: 'error', text: t('week.error') });
        return;
      }
      writeDraft(week.weekKey, null);
      applyMe(data.me);
      const partial = data.items?.some((i) => !i.ok);
      const jokerFail = data.joker && !data.joker.ok;
      setStatus(partial ? { tone: 'error', text: t('week.partial') } : jokerFail ? { tone: 'error', text: t('week.jokerLocked') } : { tone: 'ok', text: t('week.saved') });
    } catch {
      setStatus({ tone: 'error', text: t('week.error') });
    } finally {
      setSaving(false);
    }
  };

  const saveNick = async () => {
    const value = nick.trim();
    if (!value) return;
    const res = await fetch('/api/user/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username: value }) });
    const data = (await res.json().catch(() => ({}))) as { username?: string; code?: string };
    if (!res.ok) {
      setNickError(res.status === 409 ? t('nick.taken') : data.code === 'USERNAME_NOT_ALLOWED' ? t('nick.notAllowed') : t('nick.format'));
      return;
    }
    await updateSession({ username: data.username ?? value }).catch(() => {});
    setNeedNick(false);
    setNickError(null);
    await save();
  };

  const firstOpen = week.matches.filter((m) => !isLocked(m, now)).sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))[0];

  return (
    <section id="hafta" className={styles.section} aria-labelledby="game-week-title">
      <div className={styles.weekHead}>
        <h2 id="game-week-title" className={styles.h2}>
          {t('week.title')} · {t('week.label', { week: weekNumber(week.weekKey) })}
        </h2>
        {prevKey || nextKey ? (
          <nav className={styles.weekNav} aria-label={t('week.title')}>
            {prevKey ? <Link href={`${GAME_BRAND.basePath}/hafta/${prevKey}`}>← {t('week.prev')}</Link> : null}
            {nextKey ? <Link href={`${GAME_BRAND.basePath}/hafta/${nextKey}`}>{t('week.next')} →</Link> : null}
          </nav>
        ) : null}
      </div>
      {week.status === 'SETTLED' ? <p className={styles.muted}>{t('week.settled')}</p> : open ? <p className={styles.muted}>{t('week.jokerHint')}</p> : null}

      <ol className={styles.matches}>
        {week.matches.map((m) => {
          const locked = isLocked(m, now);
          const d = draft[m.id] ?? { home: null, away: null };
          const s = saved.get(m.id);
          const isJoker = joker === m.id;
          const left = now != null ? Date.parse(m.kickoffAt) - now : null;
          const kind = m.status === 'VOID' ? 'void' : locked ? 'locked' : 'open';
          const dv = dist[m.id];
          return (
            <li key={m.id} className={styles.match} data-joker={isJoker ? '' : undefined}>
              <div className={styles.meta}>
                <span>{formatKickoff(m.kickoffAt, locale)}</span>
                <span className={styles.state} data-kind={kind}>
                  {m.status === 'VOID' ? t('week.void') : m.result ? t('week.result') : locked ? t('week.live') : left != null ? t('week.lockIn', { left: formatLeft(left, t) }) : ''}
                </span>
              </div>
              <div className={`${styles.team} ${styles.home}`}>
                <span>{m.home.name}</span>
                <TeamLogo src={m.home.logo} width={28} alt="" fallback={<span className={styles.logoFallback} aria-hidden="true">{m.home.name.slice(0, 1)}</span>} />
              </div>
              <div className={styles.pick}>
                {locked ? (
                  <span className={styles.result} aria-label={m.result ? t('week.result') : t('week.yourPick')}>
                    {m.result ? `${m.result.home} – ${m.result.away}` : s ? `${s.home} – ${s.away}` : '–'}
                  </span>
                ) : (
                  <>
                    <GoalInput label={`${m.home.name}: ${t('week.home')}`} value={d.home} onChange={(v) => setGoal(m.id, 'home', v)} t={t} />
                    <span className={styles.sep}>–</span>
                    <GoalInput label={`${m.away.name}: ${t('week.away')}`} value={d.away} onChange={(v) => setGoal(m.id, 'away', v)} t={t} />
                  </>
                )}
              </div>
              <div className={`${styles.team} ${styles.away}`}>
                <TeamLogo src={m.away.logo} width={28} alt="" fallback={<span className={styles.logoFallback} aria-hidden="true">{m.away.name.slice(0, 1)}</span>} />
                <span>{m.away.name}</span>
              </div>
              <div className={styles.foot}>
                {locked ? (
                  <span>
                    {t('week.yourPick')}: {s ? `${s.home} – ${s.away}` : t('week.noPick')}
                    {isJoker ? ` · ${t('week.joker')}` : ''}
                  </span>
                ) : (
                  <button type="button" className={styles.jokerBtn} aria-pressed={isJoker} onClick={() => toggleJoker(m.id)}>
                    ★ {isJoker ? t('week.jokerOn') : t('week.setJoker')}
                  </button>
                )}
                {s?.breakdown ? (
                  <span className={styles.chips}>
                    {(['dir', 'diff', 'total', 'exact', 'rare'] as const).filter((k) => s.breakdown![k] > 0).map((k) => (
                      <span key={k} className={styles.chip}>
                        {t(`bd.${k}`)} +{s.breakdown![k]}
                      </span>
                    ))}
                    {s.breakdown.joker ? <span className={styles.chip}>{t('bd.joker')}</span> : null}
                    <span className={styles.pts}>{t('week.points', { count: s.points ?? 0 })}</span>
                  </span>
                ) : dv && dv.total > 0 ? (
                  <span title={`${t('week.community')}: ${dv.shares.home}% / ${dv.shares.draw}% / ${dv.shares.away}%`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t('week.community')}
                    <span className={styles.dist} aria-label={`${dv.shares.home}% / ${dv.shares.draw}% / ${dv.shares.away}%`}>
                      <span style={{ width: `${dv.shares.home}%` }} />
                      <span style={{ width: `${dv.shares.draw}%` }} />
                      <span style={{ width: `${dv.shares.away}%` }} />
                    </span>
                  </span>
                ) : null}
                <Link href={m.href}>{t('week.matchPage')}</Link>
              </div>
            </li>
          );
        })}
      </ol>

      {me ? (
        <p className={styles.muted}>
          {t('week.total', { points: me.totalPoints })}
          {me.rank ? ` · ${t('week.rank', { rank: me.rank })}` : ''}
          {!me.visible && me.nickname ? ` · ${t('week.notVisible')}` : ''}
        </p>
      ) : null}

      {needNick ? (
        <form
          className={`${styles.card} ${styles.nickForm}`}
          onSubmit={(e) => {
            e.preventDefault();
            void saveNick();
          }}
        >
          <label htmlFor="game-nick">{t('nick.prompt')}</label>
          <input id="game-nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={30} autoComplete="nickname" placeholder={t('nick.placeholder')} aria-invalid={nickError ? true : undefined} />
          <button type="submit" className={styles.btn}>
            {t('nick.save')}
          </button>
          {nickError ? (
            <p className={styles.status} data-tone="error" role="alert">
              {nickError}
            </p>
          ) : null}
        </form>
      ) : null}

      {open ? (
        <div className={styles.saveBar}>
          <p className={styles.status} data-tone={status?.tone ?? 'info'} role="status">
            {status?.text ?? (dirty ? t('week.unsaved') : firstOpen && now != null ? t('cta.firstKickoff', { left: formatLeft(Date.parse(firstOpen.kickoffAt) - now, t) }) : '')}
          </p>
          <button type="button" className={styles.btn} onClick={() => void save()} disabled={saving || authStatus === 'loading' || (authStatus === 'authenticated' && !dirty)}>
            {authStatus === 'unauthenticated' ? t('week.loginToPlay') : saving ? t('week.saving') : t('week.save')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function GoalInput({ label, value, onChange, t }: { label: string; value: number | null; onChange: (v: number | null) => void; t: (k: string) => string }) {
  return (
    <span className={styles.stepper}>
      <button type="button" aria-label={`${label} – ${t('week.inc')}`} onClick={() => onChange((value ?? -1) + 1)} disabled={value != null && value >= MAX_GOALS}>
        +
      </button>
      <input
        className={styles.goal}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 2);
          onChange(v === '' ? null : Number(v));
        }}
      />
      <button type="button" aria-label={`${label} – ${t('week.dec')}`} onClick={() => onChange(value == null ? 0 : value - 1)} disabled={value == null || value <= 0}>
        −
      </button>
    </span>
  );
}
