/**
 * Milli takım sayfası (sade; API-Football, id >= 2e9): başlık (+ sıradaki maç), kalan fikstür, turnuva grubunun puan durumu,
 * son maçlar, kadro. Lig takım sayfasındaki (Sportmonks) sezon özeti, gol krallığı, transfer, sakatlık vb. kartlar yok.
 * Hata ≠ veri yok: hata → "yüklenemedi · tekrar dene". Puan durumu maç sayfasının BFF ucunu (önbellekli) yeniden kullanır.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import TeamLogo from '@/components/TeamLogo';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { Match } from '@/models/liveScore';
import { fetchNationalStandings } from '@/services/apiFootball/clientFetch';
import type { CompetitionTableData } from '@/services/liveScoreService';
import type { NationalSquadPlayer, NationalTeamPayload } from '@/server/apiFootball/nationalTeam';
import { standingsGroupHeading } from '@/components/MatchCompetitionStandings/groupHeading';
import { buildMatchHref } from '@/utils/matchUrl';
import { reduceStandingsToTeamGroup, titleStandings } from '@/utils/nationalStandings';
import styles from './nationalTeamView.module.scss';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'missing' } | { kind: 'ready'; data: NationalTeamPayload };
type Translate = (key: string, opts?: Record<string, unknown>) => string;

const RECENT_VISIBLE = 5;
/** AF ham mevki → çeviri anahtarı (eski önbellekteki Türkçe değerler de tanınır). */
const POSITION_KEYS: Array<{ key: string; names: string[] }> = [
  { key: 'posGoalkeeper', names: ['Goalkeeper', 'Kaleci'] },
  { key: 'posDefender', names: ['Defender', 'Defans'] },
  { key: 'posMidfielder', names: ['Midfielder', 'Orta saha'] },
  { key: 'posAttacker', names: ['Attacker', 'Forvet'] },
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

function scoreLabel(m: Match, t: Translate): string {
  if (m.status === 'NOT STARTED') return m.scheduled ? utcToTr(m.scheduled) : t('national.timeTbd');
  return (m.scores?.score ?? '–').replace('-', ' - ');
}

function codeOf(name: string, code?: string): string {
  return (code || name.replace(/[^\p{L}]/gu, '').slice(0, 3)).toLocaleUpperCase('tr-TR');
}

function MatchRow({ m, locale, t }: { m: Match; locale: string; t: Translate }) {
  return (
    <li>
      <Link href={buildMatchHref(m)} className={styles.row}>
        <span className={styles.date}>{shortDate(m.date, locale)}</span>
        <span className={styles.home}>{m.home.name}</span>
        <span className={styles.score}>{scoreLabel(m, t)}</span>
        <span className={styles.away}>{m.away.name}</span>
        {m.competition?.name ? <span className={styles.comp}>{m.competition.name}</span> : null}
      </Link>
    </li>
  );
}

function groupSquad(squad: NationalSquadPlayer[]) {
  const used = new Set<NationalSquadPlayer>();
  const groups = POSITION_KEYS.map(({ key, names }) => {
    const players = squad.filter((p) => names.includes(p.position));
    players.forEach((p) => used.add(p));
    return { key, players: sortByNumber(players) };
  });
  // Görüntüleme sırası lig takım sayfasıyla aynı: Forvet → Orta saha → Defans → Kaleci.
  const ordered = [groups[3]!, groups[2]!, groups[1]!, groups[0]!];
  const rest = squad.filter((p) => !used.has(p));
  if (rest.length) ordered.push({ key: 'posOther', players: sortByNumber(rest) });
  return ordered.filter((g) => g.players.length > 0);
}

function sortByNumber(players: NationalSquadPlayer[]): NationalSquadPlayer[] {
  return [...players].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
}

function StatePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root}>
      <div className={`${styles.card} ${styles.state}`}>{children}</div>
    </div>
  );
}

export default function NationalTeamView({ teamId }: { teamId: string; variant?: 'page' | 'panel' }) {
  const { t } = useTranslation('team');
  const { t: tm } = useTranslation('match');
  const { locale } = useI18n();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [standings, setStandings] = useState<{ kind: 'idle' | 'loading' | 'none' | 'error' } | { kind: 'ready'; data: CompetitionTableData }>({ kind: 'idle' });
  const [standingsAttempt, setStandingsAttempt] = useState(0);
  const [showAllRecent, setShowAllRecent] = useState(false);

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
  }, [competitionId, standingsAttempt]);

  const reduced = useMemo(
    () => (standings.kind === 'ready' && data ? reduceStandingsToTeamGroup(standings.data, [data.team.id]) : null),
    [standings, data],
  );

  if (state.kind === 'loading') return <StatePanel>{t('national.loading')}</StatePanel>;
  if (state.kind === 'missing') return <StatePanel>{t('national.notFound')}</StatePanel>;
  if (state.kind === 'error' || !data) {
    return (
      <StatePanel>
        {t('national.loadError')}
        <button type="button" className={styles.retry} onClick={load}>
          {t('national.retry')}
        </button>
      </StatePanel>
    );
  }

  const { team, venue, last, next, squad } = data;
  const nextMatch = next[0];
  const upcoming = next.slice(1);
  const recentShown = showAllRecent ? last : last.slice(0, RECENT_VISIBLE);
  const squadGroups = groupSquad(squad);
  const showStandings = standings.kind === 'ready' || standings.kind === 'loading' || standings.kind === 'error';
  const titled = reduced ? titleStandings(reduced.data, reduced.groupName ? standingsGroupHeading(reduced.groupName, tm) : null) : null;
  const tableData = titled?.data ?? null;
  const tableTitle = titled?.title;
  const opponent = nextMatch ? (Number(nextMatch.home.id) === team.id ? nextMatch.away : nextMatch.home) : null;

  return (
    <div className={styles.root}>
      <section className={`${styles.card} ${styles.header}`}>
        <div className={styles.identity}>
          <span className={styles.flag}>
            <TeamLogo src={team.logo} width={56} height={56} alt="" className={styles.flagImg} fallback={<span className={styles.flagFallback}>{codeOf(team.name, team.code)}</span>} />
          </span>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{team.name}</h1>
            <p className={styles.badge}>{t('national.nationalTeam')}</p>
            <p className={styles.meta}>
              {[team.founded ? t('national.founded', { year: team.founded }) : null, venue?.name ? `${venue.name}${venue.city ? `, ${venue.city}` : ''}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        {nextMatch && opponent ? (
          <Link href={buildMatchHref(nextMatch)} className={styles.nextBox}>
            <span className={styles.nextLabel}>{t('nextBox.label')}</span>
            <span className={styles.nextOpp}>
              <TeamLogo src={opponent.logo} width={22} height={22} alt="" className={styles.nextLogo} fallback={<span className={styles.nextLogoFallback}>{codeOf(opponent.name)}</span>} />
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

      <nav className={styles.sectionNav} aria-label={t('national.navAria')}>
        {showStandings ? <a href="#ulusal-puan">{t('national.navStandings')}</a> : null}
        <a href="#ulusal-son">{t('national.navRecent')}</a>
        <a href="#ulusal-kadro">{t('national.navSquad')}</a>
      </nav>

      {upcoming.length ? (
        <section className={styles.card}>
          <h2 className={styles.h2}>{t('national.upcoming')}</h2>
          <ul className={styles.list}>{upcoming.map((m) => <MatchRow key={m.id} m={m} locale={locale} t={t} />)}</ul>
        </section>
      ) : null}

      {showStandings ? (
        <section id="ulusal-puan" className={styles.anchor}>
          {standings.kind === 'ready' && tableData ? (
            <MatchCompetitionStandings data={tableData} homeTeamId={team.id} competitionName={tableTitle} />
          ) : standings.kind === 'loading' ? (
            <div className={`${styles.card} ${styles.muted}`}>{t('national.loading')}</div>
          ) : (
            <div className={`${styles.card} ${styles.muted}`}>
              {t('national.standingsError')}
              <button type="button" className={styles.retry} onClick={() => setStandingsAttempt((n) => n + 1)}>
                {t('national.retry')}
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section id="ulusal-son" className={`${styles.card} ${styles.anchor}`}>
        <h2 className={styles.h2}>{t('national.recentTitle')}</h2>
        {last.length ? (
          <>
            <ul className={styles.list}>{recentShown.map((m) => <MatchRow key={m.id} m={m} locale={locale} t={t} />)}</ul>
            {!showAllRecent && last.length > RECENT_VISIBLE ? (
              <div className={styles.more}>
                <button type="button" className={styles.moreBtn} onClick={() => setShowAllRecent(true)} aria-label={t('recent.moreAria', { count: last.length - RECENT_VISIBLE })}>
                  {t('recent.more')}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.muted}>{t('recent.empty')}</p>
        )}
      </section>

      <section id="ulusal-kadro" className={`${styles.card} ${styles.anchor}`}>
        <h2 className={styles.h2}>{t('national.squadTitle')}</h2>
        {squadGroups.length ? (
          squadGroups.map((g, i) => (
            <details key={g.key} className={styles.squadGroup} open={i === 0 || undefined}>
              <summary className={styles.squadTitle}>
                {t(`national.${g.key}`)} <span className={styles.squadCount}>{g.players.length}</span>
              </summary>
              <ul className={styles.players}>
                {g.players.map((p) => (
                  <li key={p.id}>
                    <span className={styles.num}>{p.number ?? ''}</span>
                    <span className={styles.playerName}>{p.name}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))
        ) : (
          <p className={styles.muted}>{t('national.squadEmpty')}</p>
        )}
      </section>
    </div>
  );
}
