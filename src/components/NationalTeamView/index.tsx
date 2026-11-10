/**
 * Milli takım sayfası (API-Football, id >= 2e9): lig takım sayfasıyla aynı iskelet — tam genişlik başlık kartı (bayrak, ad,
 * künye, sıradaki maç), altında iki sütun: solda sekmeler (Son Maçlar · Fikstür · Kadro), sağda takımın turnuva grubunun
 * puan durumu. Lig sayfasındaki sezon özeti, gol krallığı, transfer, sakatlık kartları yok (ek AF isteği ister).
 * Hata ≠ veri yok: hata → "yüklenemedi · tekrar dene". Puan durumu maç sayfasının BFF ucunu (önbellekli) yeniden kullanır.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import { standingsGroupHeading } from '@/components/MatchCompetitionStandings/groupHeading';
import { PanelSkeleton, SkeletonBlock, StandingsSkeleton } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { Match } from '@/models/liveScore';
import { fetchNationalStandings } from '@/services/apiFootball/clientFetch';
import type { CompetitionTableData } from '@/services/liveScoreService';
import type { NationalSquadPlayer, NationalTeamPayload } from '@/server/apiFootball/nationalTeam';
import { buildMatchHref } from '@/utils/matchUrl';
import { reduceStandingsToTeamGroup, titleStandings, withoutStandingsForm } from '@/utils/nationalStandings';
import styles from './nationalTeamView.module.scss';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'missing' } | { kind: 'ready'; data: NationalTeamPayload };
type StandingsState = { kind: 'idle' | 'loading' | 'none' | 'error' } | { kind: 'ready'; data: CompetitionTableData };
type Translate = (key: string, opts?: Record<string, unknown>) => string;
type Tab = 'recent' | 'fixtures' | 'squad';

const RECENT_VISIBLE = 5;
/** AF ham mevki → çeviri anahtarı (eski önbellekteki Türkçe değerler de tanınır). Görüntüleme sırası: Forvet → Orta saha → Defans → Kaleci. */
const POSITION_KEYS: Array<{ key: string; names: string[] }> = [
  { key: 'posAttacker', names: ['Attacker', 'Forvet'] },
  { key: 'posMidfielder', names: ['Midfielder', 'Orta saha'] },
  { key: 'posDefender', names: ['Defender', 'Defans'] },
  { key: 'posGoalkeeper', names: ['Goalkeeper', 'Kaleci'] },
];
/** Hazırlık maçlarının puan durumu yok. */
const FRIENDLIES_APP_ID = 2_000_000_010;

/** "HH:MM" (UTC) → Türkiye saati (UTC+3). */
function utcToTr(hhmm: string): string {
  const [h = '0', mm = '00'] = hhmm.split(':');
  return `${String((Number(h) + 3) % 24).padStart(2, '0')}:${mm}`;
}

function shortDate(date: string | undefined, locale: string): string {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

function codeOf(name: string, code?: string): string {
  return (code || name.replace(/[^\p{L}]/gu, '').slice(0, 3)).toLocaleUpperCase('tr-TR');
}

/** AF isimleri karışık ("Aral Simsir" / "A. Güler"): hepsi "A. Soyad"; tek sözcük ve zaten kısaltılmış adlar olduğu gibi. */
export function formatPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  const [first, ...rest] = parts as [string, ...string[]];
  return `${[...first][0]!.toLocaleUpperCase('tr-TR')}. ${rest.join(' ')}`;
}

type Outcome = 'W' | 'D' | 'L' | null;

/** Takımın bu maçtaki sonucu (bitmiş maçta skordan); skor yoksa null. */
function outcomeFor(m: Match, teamId: number): Outcome {
  if (m.status === 'NOT STARTED') return null;
  const [a, b] = (m.scores?.score ?? '').split('-').map((x) => Number(x.trim()));
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  const isHome = Number(m.home.id) === teamId;
  const mine = isHome ? a : b;
  const other = isHome ? b : a;
  return mine > other ? 'W' : mine < other ? 'L' : 'D';
}

function Flag({ src, name }: { src?: string | null; name: string }) {
  return (
    <TeamLogo
      src={src}
      width={20}
      height={14}
      alt=""
      className={styles.rowFlag}
      fallback={<span className={styles.rowFlagFallback} aria-hidden="true">{codeOf(name)}</span>}
    />
  );
}

function MatchRow({ m, teamId, locale, t }: { m: Match; teamId: number; locale: string; t: Translate }) {
  const outcome = outcomeFor(m, teamId);
  const played = m.status !== 'NOT STARTED';
  const score = played ? (m.scores?.score ?? '–').replace('-', ' - ') : m.scheduled ? utcToTr(m.scheduled) : t('fixtures.timeTbd');
  const scoreClass = outcome === 'W' ? styles.win : outcome === 'D' ? styles.draw : outcome === 'L' ? styles.loss : styles.pending;
  return (
    <li>
      <Link href={buildMatchHref(m)} className={styles.row}>
        <span className={styles.date}>{shortDate(m.date, locale)}</span>
        <span className={`${styles.team} ${styles.teamHome}`}>
          <span className={styles.teamName}>{m.home.name}</span>
          <Flag src={m.home.logo} name={m.home.name} />
        </span>
        <span className={`${styles.score} ${scoreClass}`}>{score}</span>
        <span className={`${styles.team} ${styles.teamAway}`}>
          <Flag src={m.away.logo} name={m.away.name} />
          <span className={styles.teamName}>{m.away.name}</span>
        </span>
        {m.competition?.name ? <span className={styles.comp} title={m.competition.name}>{m.competition.name}</span> : <span />}
      </Link>
    </li>
  );
}

function groupSquad(squad: NationalSquadPlayer[]) {
  const used = new Set<NationalSquadPlayer>();
  const groups = POSITION_KEYS.map(({ key, names }) => {
    const players = squad.filter((p) => names.includes(p.position));
    players.forEach((p) => used.add(p));
    return { key, players: sortByName(players) };
  });
  const rest = squad.filter((p) => !used.has(p));
  if (rest.length) groups.push({ key: 'posOther', players: sortByName(rest) });
  return groups.filter((g) => g.players.length > 0);
}

// AF `players/squads` forma numarası milli takımda güvenilmez (dönemler karışır): numara gösterilmez, ada göre sıralanır.
function sortByName(players: NationalSquadPlayer[]): NationalSquadPlayer[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function PageSkeleton() {
  return (
    <div className={styles.root} aria-busy="true">
      <section className={`${styles.card} ${styles.header}`}>
        <div className={styles.identity}>
          <SkeletonBlock width={72} height={72} />
          <div className={styles.skelText}>
            <SkeletonBlock width={180} height={26} />
            <SkeletonBlock width={110} height={14} />
          </div>
        </div>
        <SkeletonBlock className={styles.skelNext} height={64} />
      </section>
      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.tabs}>
            <SkeletonBlock width={96} height={32} />
            <SkeletonBlock width={80} height={32} />
            <SkeletonBlock width={72} height={32} />
          </div>
          <PanelSkeleton rows={6} />
        </div>
        <aside className={styles.right}>
          <StandingsSkeleton />
        </aside>
      </div>
    </div>
  );
}

export default function NationalTeamView({ teamId }: { teamId: string; variant?: 'page' | 'panel' }) {
  const { t } = useTranslation('team');
  const { t: tm } = useTranslation('match');
  const { locale } = useI18n();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [standings, setStandings] = useState<StandingsState>({ kind: 'idle' });
  const [standingsAttempt, setStandingsAttempt] = useState(0);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [tab, setTab] = useState<Tab>('recent');

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/national/teams/${encodeURIComponent(teamId)}`);
        if (cancelled) return;
        if (res.status === 404) return setState({ kind: 'missing' });
        if (!res.ok) return setState({ kind: 'error' });
        setState({ kind: 'ready', data: (await res.json()) as NationalTeamPayload });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, attempt]);

  const data = state.kind === 'ready' ? state.data : null;
  // Grup tablosu için turnuva: sıradaki maçın (yoksa son maçın) hazırlık olmayan turnuvası.
  const competitionId = useMemo(() => {
    if (!data) return null;
    const m = [...data.next, ...data.last].find((x) => x.competition?.id != null && Number(x.competition.id) !== FRIENDLIES_APP_ID);
    return m?.competition?.id != null ? Number(m.competition.id) : null;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (competitionId == null) return setStandings({ kind: 'none' });
    let cancelled = false;
    setStandings({ kind: 'loading' });
    fetchNationalStandings(competitionId).then(
      (d) => !cancelled && setStandings(d ? { kind: 'ready', data: d } : { kind: 'none' }),
      () => !cancelled && setStandings({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [data, competitionId, standingsAttempt]);

  const titled = useMemo(() => {
    if (standings.kind !== 'ready' || !data) return null;
    const reduced = reduceStandingsToTeamGroup(standings.data, [data.team.id]);
    const t2 = titleStandings(reduced.data, reduced.groupName ? standingsGroupHeading(reduced.groupName, tm) : null);
    return { data: withoutStandingsForm(t2.data), title: t2.title };
  }, [standings, data, tm]);

  if (state.kind === 'loading') return <PageSkeleton />;
  if (state.kind === 'missing' || state.kind === 'error' || !data) {
    return (
      <div className={styles.root}>
        <div className={`${styles.card} ${styles.state}`}>
          {state.kind === 'missing' ? t('national.notFound') : t('national.loadError')}
          {state.kind === 'missing' ? null : (
            <button type="button" className={styles.retry} onClick={load}>
              {t('national.retry')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const { team, venue, last, next, squad } = data;
  const nextMatch = next[0];
  const opponent = nextMatch ? (Number(nextMatch.home.id) === team.id ? nextMatch.away : nextMatch.home) : null;
  const recentShown = showAllRecent ? last : last.slice(0, RECENT_VISIBLE);
  const squadGroups = groupSquad(squad);
  const showStandings = standings.kind !== 'none' && standings.kind !== 'idle';

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'recent', label: t('tabs.recent') },
    { key: 'fixtures', label: t('tabs.fixtures') },
    { key: 'squad', label: t('tabs.squad') },
  ];

  return (
    <div className={styles.root}>
      <section className={`${styles.card} ${styles.header}`}>
        <div className={styles.identity}>
          <span className={styles.flag}>
            <TeamLogo src={team.logo} width={72} height={72} alt="" priority className={styles.flagImg} fallback={<span className={styles.flagFallback}>{codeOf(team.name, team.code)}</span>} />
          </span>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{team.name}</h1>
            <p className={styles.badge}>{t('national.nationalTeam')}</p>
            <dl className={styles.facts}>
              {team.founded ? (
                <div>
                  <dt>{t('national.founded')}</dt>
                  <dd>{team.founded}</dd>
                </div>
              ) : null}
              {venue?.name ? (
                <div>
                  <dt>{t('national.stadium')}</dt>
                  <dd>{`${venue.name}${venue.city ? `, ${venue.city}` : ''}`}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
        {nextMatch && opponent ? (
          <Link href={buildMatchHref(nextMatch)} className={styles.nextBox}>
            <span className={styles.nextLabel}>{t('nextBox.label')}</span>
            <span className={styles.nextOpp}>
              <Flag src={opponent.logo} name={opponent.name} />
              {opponent.name}
            </span>
            <span className={styles.nextWhen}>
              {shortDate(nextMatch.date, locale)}
              {nextMatch.scheduled ? ` · ${utcToTr(nextMatch.scheduled)}` : ''}
              {nextMatch.competition?.name ? ` · ${nextMatch.competition.name}` : ''}
            </span>
          </Link>
        ) : null}
      </section>

      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.tabs} role="tablist">
            {tabs.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`${styles.tab} ${tab === x.key ? styles.tabActive : ''}`} onClick={() => setTab(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
          <div className={`${styles.card} ${styles.tabContent}`} role="tabpanel">
            {tab === 'recent' ? (
              last.length ? (
                <>
                  <ul className={styles.list}>{recentShown.map((m) => <MatchRow key={m.id} m={m} teamId={team.id} locale={locale} t={t} />)}</ul>
                  {!showAllRecent && last.length > RECENT_VISIBLE ? (
                    <div className={styles.more}>
                      <button type="button" className={styles.moreBtn} onClick={() => setShowAllRecent(true)} aria-label={t('recent.moreAria', { count: last.length - RECENT_VISIBLE })}>
                        {t('recent.more')}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.muted}>{t('national.empty')}</p>
              )
            ) : null}
            {tab === 'fixtures' ? (
              next.length ? <ul className={styles.list}>{next.map((m) => <MatchRow key={m.id} m={m} teamId={team.id} locale={locale} t={t} />)}</ul> : <p className={styles.muted}>{t('national.upcomingEmpty')}</p>
            ) : null}
            {tab === 'squad' ? (
              squadGroups.length ? (
                squadGroups.map((g) => (
                  <details key={g.key} className={styles.squadGroup} open>
                    <summary className={styles.squadTitle}>
                      {t(`national.${g.key}`)} <span className={styles.squadCount}>{g.players.length}</span>
                    </summary>
                    <ul className={styles.players}>
                      {g.players.map((p) => (
                        <li key={p.id}>
                          {p.photo ? <TeamLogo src={p.photo} width={28} height={28} alt="" className={styles.photo} /> : null}
                          <span className={styles.playerName} title={p.name}>{formatPlayerName(p.name)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))
              ) : (
                <p className={styles.muted}>{t('national.squadEmpty')}</p>
              )
            ) : null}
          </div>
        </div>

        {showStandings ? (
          <aside className={styles.right}>
            {standings.kind === 'ready' && titled ? (
              <MatchCompetitionStandings data={titled.data} homeTeamId={team.id} competitionName={titled.title} />
            ) : standings.kind === 'loading' ? (
              <StandingsSkeleton />
            ) : (
              <div className={`${styles.card} ${styles.muted}`}>
                {t('national.standingsError')}
                <button type="button" className={styles.retry} onClick={() => setStandingsAttempt((n) => n + 1)}>
                  {t('national.retry')}
                </button>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
