import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import { useNow } from '@/hooks/useNow';
import TeamLogo from '@/components/TeamLogo';
import { GAME_BRAND } from '@/config/brand';
import { MAX_GOALS } from '@/lib/game/scoring';
import type { DistributionView, GameMatchView, GameWeekView, MyPredictionView, MyStandingView, MyWeekView, SaveResult } from '@/lib/game/types';
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

/** Hızlı skor çipleri (en sık skorlar; dokununca iki tarafı birden doldurur). */
const QUICK_SCORES: readonly [number, number][] = [
  [1, 0],
  [2, 1],
  [1, 1],
  [0, 0],
  [2, 0],
  [0, 1],
  [1, 2],
  [2, 2],
];

/**
 * Haftanın 5 maçı. Üstte kompakt hafta kartı (ilerleme halkası, ilk kilit, girişliyse sezon sırası · üstündekine fark · seri),
 * sonra açık maçlar büyük kartlarda (logolar, +/– skor kutuları, hızlı skor çipleri, altın joker), başlamış / biten maçlar
 * tek satırda (dokununca puan kırılımı + topluluk dağılımı). Kaydet çubuğu yalnız kaydedilmemiş değişiklik varken altta sabit.
 * Skor girişleri (+/–), joker, kalan süre, sonuç ve puan kırılımı. Kilit SUNUCUDA (veritabanı saati); buradaki
 * kilit yalnız görünüm. Girişsiz kullanıcı da doldurabilir: taslak tarayıcıda tutulur, kaydetmede Google girişine gider ve
 * dönüşte geri yüklenir. Takma ad yoksa satır içi form (Frikik ile aynı PATCH /api/user/me).
 */
export default function WeekPlay({
  week,
  prevKey,
  nextKey,
  renderedAt,
  headingLevel = 'h1',
}: {
  week: GameWeekView;
  prevKey?: string | null;
  nextKey?: string | null;
  /** SSR anı (ISO): ilk çizimde başlamış maçlar doğru grupta olsun (istemci saati gelince düzelir). */
  renderedAt?: string;
  headingLevel?: 'h1' | 'h2';
}) {
  const { t } = useTranslation('game');
  const { locale } = useI18n();
  const { status: authStatus, update: updateSession } = useSession();
  const liveNow = useNow(30_000);
  const now = liveNow ?? (renderedAt ? Date.parse(renderedAt) : null);
  const [standing, setStanding] = useState<MyStandingView | null>(null);
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

  // Sezon sırası · üstündekine fark · seri (kompakt şerit).
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    fetch(`/api/game/leaderboard/me?scope=season&key=${week.season}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? (r.json() as Promise<MyStandingView>) : null))
      .then((m) => !cancelled && setStanding(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authStatus, week.season, me?.totalPoints]);

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

  const setBoth = (id: string, home: number, away: number) => {
    setStatus(null);
    setDraft((prev) => {
      const next = { ...prev, [id]: { home, away } };
      if (authStatus !== 'authenticated') writeDraft(week.weekKey, { picks: next, joker });
      return next;
    });
  };

  const setGoal = (id: string, side: 'home' | 'away', value: number | null) => {
    setStatus(null);
    setDraft((prev) => {
      const cur = prev[id] ?? { home: null, away: null };
      const next = {
        ...prev,
        [id]: {
          ...cur,
          [side]: value == null ? null : Math.max(0, Math.min(MAX_GOALS, value)),
        },
      };
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
        items: dirtyItems.map((m) => ({
          gameMatchId: m.id,
          home: draft[m.id]!.home!,
          away: draft[m.id]!.away!,
        })),
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
    const res = await fetch('/api/user/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: value }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      username?: string;
      code?: string;
    };
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
  const openMatches = week.matches.filter((m) => !isLocked(m, now));
  const lockedMatches = week.matches.filter((m) => isLocked(m, now));
  const liveCount = lockedMatches.filter((m) => m.status === 'SCHEDULED').length;
  const playable = week.matches.filter((m) => m.status !== 'VOID');
  const pickedCount = playable.filter((m) => {
    const d = draft[m.id];
    return (d && d.home != null && d.away != null) || saved.has(m.id);
  }).length;
  const scored = me?.predictions.filter((p) => p.points != null) ?? [];
  const showBar = open && (dirty || saving || !!status);
  const Heading = headingLevel;

  return (
    <section id="hafta" className={styles.play} aria-labelledby="game-week-title">
      <header className={styles.weekHero}>
        <div className={styles.weekHeroTop}>
          <div className={styles.weekHeroText}>
            <p className={styles.kicker}>
              {t('week.label', { week: weekNumber(week.weekKey) })} · {GAME_BRAND.name}
            </p>
            <Heading id="game-week-title" className={styles.weekTitle}>
              {t('hero.title')}
            </Heading>
            <p className={styles.weekHeroMeta}>
              {liveCount > 0 ? (
                <>
                  <a href="#baslayan" className={styles.heroLive}>
                    {t('week.liveCount', { count: liveCount })}
                  </a>
                  {firstOpen && now != null ? ` · ${t('cta.firstKickoff', { left: formatLeft(Date.parse(firstOpen.kickoffAt) - now, t) })}` : null}
                </>
              ) : week.status === 'SETTLED' ? (
                t('week.settled')
              ) : firstOpen && now != null ? (
                `${t('cta.firstKickoff', { left: formatLeft(Date.parse(firstOpen.kickoffAt) - now, t) })} · ${t('hero.jokerShort')}`
              ) : (
                t('hero.free')
              )}
            </p>
          </div>
          <ProgressRing
            done={pickedCount}
            total={playable.length}
            label={t('week.picked', {
              done: pickedCount,
              total: playable.length,
            })}
          />
        </div>
        {authStatus === 'authenticated' && standing ? (
          <p className={styles.standing}>
            <span className={styles.standingRank}>{standing.rank ? `#${standing.rank}` : '–'}</span>
            <span>{standing.rank == null ? t('standing.unranked') : standing.gap == null ? t('standing.leader') : t('standing.gap', { count: Math.max(standing.gap, 0) })}</span>
            {standing.streak > 0 ? (
              <span
                className={styles.streak}
                aria-label={t('standing.streakLabel', {
                  count: standing.streak,
                })}
              >
                <span aria-hidden="true">🔥</span>
                {standing.streak}
              </span>
            ) : null}
            <span className={styles.standingPts}>{t('week.points', { count: me?.totalPoints ?? 0 })}</span>
          </p>
        ) : authStatus === 'unauthenticated' ? (
          <p className={styles.standing}>{t('hero.guest')}</p>
        ) : null}
      </header>

      {openMatches.length ? (
        <ol className={styles.cards} aria-label={t('week.openTitle')}>
          {openMatches.map((m) => {
            const d = draft[m.id] ?? { home: null, away: null };
            const isJoker = joker === m.id;
            const left = now != null ? Date.parse(m.kickoffAt) - now : null;
            return (
              <li key={m.id} className={styles.matchCard} data-joker={isJoker ? '' : undefined}>
                <div className={styles.cardMeta}>
                  <span>{formatKickoff(m.kickoffAt, locale)}</span>
                  {left != null ? <span className={styles.lockIn}>{t('week.lockIn', { left: formatLeft(left, t) })}</span> : null}
                </div>
                <div className={styles.duel}>
                  <TeamBadge team={m.home} />
                  <div className={styles.scorePick}>
                    <GoalInput label={`${m.home.name}: ${t('week.home')}`} value={d.home} onChange={(v) => setGoal(m.id, 'home', v)} t={t} />
                    <span className={styles.colon} aria-hidden="true">
                      :
                    </span>
                    <GoalInput label={`${m.away.name}: ${t('week.away')}`} value={d.away} onChange={(v) => setGoal(m.id, 'away', v)} t={t} />
                  </div>
                  <TeamBadge team={m.away} />
                </div>
                <div className={styles.cardFoot}>
                  <div className={styles.quick} role="group" aria-label={`${m.home.name} – ${m.away.name}: ${t('week.quick')}`}>
                    {QUICK_SCORES.map(([h, a]) => (
                      <button key={`${h}-${a}`} type="button" className={styles.quickChip} aria-pressed={d.home === h && d.away === a} onClick={() => setBoth(m.id, h, a)}>
                        {h}-{a}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.jokerBtn}
                    aria-pressed={isJoker}
                    aria-label={`${m.home.name} – ${m.away.name}: ${isJoker ? t('week.jokerOn') : t('week.setJoker')}`}
                    onClick={() => toggleJoker(m.id)}
                  >
                    <span aria-hidden="true">{isJoker ? '★' : '☆'}</span> {isJoker ? '×2' : t('week.joker')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {lockedMatches.length ? (
        <div id="baslayan" className={styles.rowsBlock}>
          <h2 className={styles.rowsTitle}>{t('week.lockedTitle')}</h2>
          <ul className={styles.rows}>
            {lockedMatches.map((m) => (
              <MatchRow key={m.id} m={m} pick={saved.get(m.id)} isJoker={joker === m.id} dv={dist[m.id]} />
            ))}
          </ul>
        </div>
      ) : null}

      {prevKey || nextKey ? (
        <nav className={styles.weekNav} aria-label={t('week.title')}>
          {prevKey ? <Link href={`${GAME_BRAND.basePath}/hafta/${prevKey}`}>← {t('week.prev')}</Link> : <span />}
          {nextKey ? <Link href={`${GAME_BRAND.basePath}/hafta/${nextKey}`}>{t('week.next')} →</Link> : null}
        </nav>
      ) : null}

      {me && scored.length ? <ShareCard week={week} me={me} rank={standing?.rank ?? null} /> : null}

      {me && !me.visible && me.nickname ? <p className={styles.muted}>{t('week.notVisible')}</p> : null}

      {needNick ? (
        <form
          className={`${styles.card} ${styles.nickForm}`}
          onSubmit={(e) => {
            e.preventDefault();
            void saveNick();
          }}
        >
          <label htmlFor="game-nick">{t('nick.prompt')}</label>
          <input
            id="game-nick"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={30}
            autoComplete="nickname"
            placeholder={t('nick.placeholder')}
            aria-invalid={nickError ? true : undefined}
          />
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

      {/* Durum metni her zaman DOM'da (ekran okuyucu duyurusu); çubuk yalnız değişiklik / kayıt / sonuç varken görünür. */}
      <div className={styles.saveBar} data-show={showBar ? '' : undefined}>
        <div className={styles.saveInfo}>
          <p className={styles.status} data-tone={status?.tone ?? 'info'} role="status">
            {status?.text ?? (dirty ? t('week.unsavedShort') : '')}
          </p>
          <span className={styles.saveDots} aria-hidden="true">
            {playable.map((m) => {
              const d = draft[m.id];
              const filled = (d && d.home != null && d.away != null) || saved.has(m.id);
              return <i key={m.id} data-filled={filled ? '' : undefined} data-joker={joker === m.id ? '' : undefined} />;
            })}
          </span>
        </div>
        {open ? (
          <button
            type="button"
            className={styles.btn}
            onClick={() => void save()}
            disabled={saving || authStatus === 'loading' || (authStatus === 'authenticated' && !dirty)}
            tabIndex={showBar ? undefined : -1}
          >
            {authStatus === 'unauthenticated'
              ? t('week.loginToPlay')
              : saving
                ? t('week.saving')
                : t('week.saveCount', {
                    done: pickedCount,
                    total: playable.length,
                  })}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ProgressRing({ done, total, label }: { done: number; total: number; label: string }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <div className={styles.ring} role="img" aria-label={label} data-complete={total > 0 && done >= total ? '' : undefined}>
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} className={styles.ringTrack} />
        <circle cx="28" cy="28" r={r} className={styles.ringValue} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span aria-hidden="true">
        {done}/{total}
      </span>
    </div>
  );
}

function TeamBadge({ team }: { team: GameMatchView['home'] }) {
  return (
    <div className={styles.teamBadge}>
      <TeamLogo
        src={team.logo}
        width={44}
        alt=""
        fallback={
          <span className={styles.logoFallback} aria-hidden="true">
            {team.name.slice(0, 1)}
          </span>
        }
      />
      <span>{team.name}</span>
    </div>
  );
}

const shortName = (team: GameMatchView['home']) => team.shortName || team.name.slice(0, 3).toUpperCase();

/**
 * Başlamış / biten / iptal maç: tek satır — satırın kendisi maç sayfasına gider (canlı skor, olaylar); sağdaki düğme puan
 * kırılımını ve topluluk dağılımını açar.
 */
function MatchRow({ m, pick, isJoker, dv }: { m: GameMatchView; pick: MyPredictionView | undefined; isJoker: boolean; dv: DistributionView | undefined }) {
  const { t } = useTranslation('game');
  const [open, setOpen] = useState(false);
  const kind = m.status === 'VOID' ? 'void' : m.result ? 'done' : 'live';
  const hit = !!pick?.breakdown?.exact;
  const bodyId = `game-row-${m.id}`;
  return (
    <li className={styles.row} data-kind={kind}>
      <div className={styles.rowLine}>
        <Link href={m.href} className={styles.rowLink} aria-label={`${m.home.name} – ${m.away.name}: ${t('week.matchPage')}`}>
          <span className={styles.rowTeams}>
            <TeamLogo
              src={m.home.logo}
              width={22}
              alt=""
              fallback={
                <span className={styles.logoFallbackSm} aria-hidden="true">
                  {m.home.name.slice(0, 1)}
                </span>
              }
            />
            <abbr title={m.home.name}>{shortName(m.home)}</abbr>
            <span className={styles.rowScore}>{m.result ? `${m.result.home}–${m.result.away}` : '–:–'}</span>
            <abbr title={m.away.name}>{shortName(m.away)}</abbr>
            <TeamLogo
              src={m.away.logo}
              width={22}
              alt=""
              fallback={
                <span className={styles.logoFallbackSm} aria-hidden="true">
                  {m.away.name.slice(0, 1)}
                </span>
              }
            />
          </span>
          <span className={styles.rowPick}>
            {pick ? `${pick.home}-${pick.away}` : t('week.noPickShort')}
            {hit ? <span aria-label={t('bd.exact')}> ✓</span> : null}
            {isJoker ? (
              <span className={styles.rowJoker} aria-label={t('week.joker')}>
                {' '}
                ★
              </span>
            ) : null}
          </span>
          {kind === 'void' ? (
            <span className={styles.rowState}>{t('week.void')}</span>
          ) : pick?.points != null ? (
            <span className={styles.rowPts} data-zero={pick.points === 0 ? '' : undefined}>
              +{pick.points}
            </span>
          ) : kind === 'live' ? (
            <span className={styles.rowLive}>{t('week.live')}</span>
          ) : (
            <span className={styles.rowState}>{t('week.result')}</span>
          )}
        </Link>
        <button type="button" className={styles.rowToggle} aria-expanded={open} aria-controls={bodyId} aria-label={t('week.details')} onClick={() => setOpen((v) => !v)}>
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open ? (
        <div id={bodyId} className={styles.rowBody}>
          <p className={styles.rowFull}>
            {m.home.name} – {m.away.name}
          </p>
          {pick?.breakdown ? (
            <span className={styles.chips}>
              {(['dir', 'diff', 'total', 'exact', 'rare'] as const)
                .filter((k) => pick.breakdown![k] > 0)
                .map((k) => (
                  <span key={k} className={styles.chip}>
                    {t(`bd.${k}`)} +{pick.breakdown![k]}
                  </span>
                ))}
              {pick.breakdown.joker ? (
                <span className={styles.chip} data-joker="">
                  {t('bd.joker')}
                </span>
              ) : null}
              <span className={styles.pts}>{t('week.points', { count: pick.points ?? 0 })}</span>
            </span>
          ) : null}
          {dv && dv.total > 0 ? (
            <span className={styles.community}>
              {t('week.community')}
              <span className={styles.dist} aria-label={`${dv.shares.home}% / ${dv.shares.draw}% / ${dv.shares.away}%`}>
                <span style={{ width: `${dv.shares.home}%` }} />
                <span style={{ width: `${dv.shares.draw}%` }} />
                <span style={{ width: `${dv.shares.away}%` }} />
              </span>
              <span className={styles.distPct}>
                {dv.shares.home}% · {dv.shares.draw}% · {dv.shares.away}%
              </span>
            </span>
          ) : null}
          <Link href={m.href}>{t('week.matchPage')} →</Link>
        </div>
      ) : null}
    </li>
  );
}

/** Haftanın sonuç kartı: puan, sıra, tam skorlar; Web Share ya da panoya kopyalama (yalnız metin + bağlantı). */
function ShareCard({ week, me, rank }: { week: GameWeekView; me: MyWeekView; rank: number | null }) {
  const { t } = useTranslation('game');
  const [copied, setCopied] = useState(false);
  const exact = me.predictions.filter((p) => p.breakdown?.exact).length;
  const n = weekNumber(week.weekKey);
  const share = async () => {
    const url = `${window.location.origin}${GAME_BRAND.basePath}`;
    const text = rank ? t('share.textRank', { week: n, points: me.totalPoints, rank }) : t('share.text', { week: n, points: me.totalPoints });
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* paylaşım iptal edildi */
    }
  };
  return (
    <div className={styles.shareCard}>
      <div>
        <p className={styles.kicker}>
          {t('share.title')} · {t('week.label', { week: n })}
        </p>
        <p className={styles.shareBig}>
          {t('week.points', { count: me.totalPoints })}
          {rank ? <span> · #{rank}</span> : null}
        </p>
        <p className={styles.shareSub}>{t('share.exact', { count: exact })}</p>
      </div>
      <button type="button" className={styles.btnGold} onClick={() => void share()}>
        {copied ? t('share.copied') : t('share.button')}
      </button>
    </div>
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
        placeholder="?"
        data-filled={value != null ? '' : undefined}
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
