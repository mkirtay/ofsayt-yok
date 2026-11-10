/**
 * Milli takım sayfası (sade; API-Football, id >= 2e9): künye + son / sıradaki maçlar + kadro. Lig takım sayfasındaki
 * (Sportmonks) sezon özeti, gol krallığı, transfer, sakatlık vb. kartlar yok. Hata ≠ veri yok: hata → "yüklenemedi · tekrar dene".
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import TeamLogo from '@/components/TeamLogo';
import type { Match } from '@/models/liveScore';
import type { NationalTeamPayload } from '@/server/apiFootball/nationalTeam';
import { buildMatchHref } from '@/utils/matchUrl';
import styles from './nationalTeamView.module.scss';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'missing' } | { kind: 'ready'; data: NationalTeamPayload };

const POSITION_ORDER = ['Forvet', 'Orta saha', 'Defans', 'Kaleci'];

function scoreLabel(m: Match): string {
  if (m.status === 'NOT STARTED') return m.scheduled ? utcToTr(m.scheduled) : '–';
  return (m.scores?.score ?? '–').replace('-', ' - ');
}

/** "HH:MM" (UTC) → Türkiye saati (UTC+3). */
function utcToTr(hhmm: string): string {
  const [h = '0', mm = '00'] = hhmm.split(':');
  return `${String((Number(h) + 3) % 24).padStart(2, '0')}:${mm}`;
}

function MatchRow({ m }: { m: Match }) {
  return (
    <li>
      <Link href={buildMatchHref(m)} className={styles.row}>
        <span className={styles.date}>{m.date ? m.date.split('-').reverse().slice(0, 2).join('.') : ''}</span>
        <span className={styles.home}>{m.home.name}</span>
        <span className={styles.score}>{scoreLabel(m)}</span>
        <span>{m.away.name}</span>
        {m.competition?.name ? <span className={styles.comp}>{m.competition.name}</span> : null}
      </Link>
    </li>
  );
}

export default function NationalTeamView({ teamId }: { teamId: string; variant?: 'page' | 'panel' }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

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

  if (state.kind === 'loading') return <div className={styles.root}><div className={styles.state}>Yükleniyor…</div></div>;
  if (state.kind === 'missing') return <div className={styles.root}><div className={styles.state}>Takım bulunamadı.</div></div>;
  if (state.kind === 'error') {
    return (
      <div className={styles.root}>
        <div className={styles.state}>
          Takım verisi yüklenemedi.
          <button type="button" className={styles.retry} onClick={load}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  const { team, venue, last, next, squad } = state.data;
  const groups = POSITION_ORDER.map((label) => ({ label, players: squad.filter((p) => p.position === label) })).filter((g) => g.players.length > 0);
  const other = squad.filter((p) => !POSITION_ORDER.includes(p.position));
  if (other.length) groups.push({ label: 'Diğer', players: other });

  return (
    <div className={styles.root}>
      <section className={`${styles.card} ${styles.header}`}>
        <TeamLogo src={team.logo} width={56} alt={team.name} />
        <div>
          <h1 className={styles.title}>{team.name}</h1>
          <p className={styles.meta}>
            Milli takım{team.country ? ` · ${team.country}` : ''}
            {team.founded ? ` · Kuruluş ${team.founded}` : ''}
            {venue?.name ? ` · ${venue.name}${venue.city ? `, ${venue.city}` : ''}` : ''}
          </p>
        </div>
      </section>
      <section className={styles.card}>
        <h2 className={styles.h2}>Sıradaki maçlar</h2>
        {next.length ? <ul className={styles.list}>{next.map((m) => <MatchRow key={m.id} m={m} />)}</ul> : <p className={styles.meta}>Yaklaşan maç yok.</p>}
      </section>
      <section className={styles.card}>
        <h2 className={styles.h2}>Son maçlar</h2>
        {last.length ? <ul className={styles.list}>{last.map((m) => <MatchRow key={m.id} m={m} />)}</ul> : <p className={styles.meta}>Maç verisi yok.</p>}
      </section>
      <section className={styles.card}>
        <h2 className={styles.h2}>Kadro</h2>
        {groups.length ? (
          groups.map((g) => (
            <div key={g.label} className={styles.squadGroup}>
              <p className={styles.squadTitle}>{g.label}</p>
              <div className={styles.players}>
                {g.players.map((p) => (
                  <span key={p.id}>
                    <span className={styles.num}>{p.number ?? ''}</span>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className={styles.meta}>Kadro verisi yok.</p>
        )}
      </section>
    </div>
  );
}
