import { useEffect, useState } from 'react';
import type { GroupedLeagueMatches } from '@/services/liveScoreService';
import type { TeamEntry } from '@/components/WorldCupTeamList';
import { getWorldCupTeamProfile } from '@/data/worldCupTeamProfiles';
import { utcTimeToTr } from '@/utils/dateFormat';
import styles from './teamDrawer.module.scss';

type SeasonHistory = {
  year: string;
  seasonId: number;
  matches: HistoryMatch[];
  bestRound: string;
};

type HistoryMatch = {
  id: number;
  date?: string;
  homeId?: number;
  homeName: string;
  homeLogo?: string;
  awayId?: number;
  awayName: string;
  awayLogo?: string;
  score?: string;
  round?: string;
  status?: string;
};

function parseHistoryMatch(m: Record<string, unknown>, teamId: number): HistoryMatch {
  const home = m.home as { id?: number; name?: string; logo?: string } | undefined;
  const away = m.away as { id?: number; name?: string; logo?: string } | undefined;
  const scores = m.scores as { ft_score?: string; score?: string } | undefined;
  return {
    id: Number(m.id ?? 0),
    date: m.date as string | undefined,
    homeId: home?.id,
    homeName: home?.name ?? '?',
    homeLogo: home?.logo,
    awayId: away?.id,
    awayName: away?.name ?? '?',
    awayLogo: away?.logo,
    score: scores?.ft_score || scores?.score || (m.score as string | undefined),
    round: m.round as string | undefined,
    status: m.status as string | undefined,
  };
}

function getBestRound(matches: HistoryMatch[]): string {
  const roundOrder = ['Final', 'SF', 'QF', 'R16', 'R32', 'Group Stage'];
  const seen = new Set<string>();
  for (const m of matches) {
    const r = (m.round ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (r === 'F' || r === 'FINAL') seen.add('Final');
    else if (r === '1/2' || r === 'SF') seen.add('SF');
    else if (r === '1/4' || r === 'QF') seen.add('QF');
    else if (r === '1/8' || r === 'R16') seen.add('R16');
    else if (r === '1/16' || r === 'R32') seen.add('R32');
    else seen.add('Group Stage');
  }
  for (const stage of roundOrder) {
    if (seen.has(stage)) return stage;
  }
  return matches.length ? 'Group Stage' : '—';
}

type Props = {
  team: TeamEntry | null;
  groupMatches: GroupedLeagueMatches[];
  onClose: () => void;
};

export default function WorldCupTeamDrawer({ team, groupMatches, onClose }: Props) {
  const [history, setHistory] = useState<SeasonHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = team ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [team]);

  // Fetch WC history when team changes
  useEffect(() => {
    if (!team) { setHistory([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    setHistory([]);

    fetch(`/api/worldcup/team-history?team_id=${team.teamId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setHistory(Array.isArray(data?.seasons) ? data.seasons : []);
      })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });

    return () => { cancelled = true; };
  }, [team?.teamId]);

  // Filter this team's group matches from allGroupMatches
  const teamGroupMatches = team
    ? groupMatches.flatMap((g) =>
        g.matches.filter(
          (m) => m.home?.id === team.teamId || m.away?.id === team.teamId
        )
      ).sort((a, b) => {
        const ak = `${a.date ?? ''} ${a.scheduled ?? a.time ?? ''}`;
        const bk = `${b.date ?? ''} ${b.scheduled ?? b.time ?? ''}`;
        return ak.localeCompare(bk);
      })
    : [];

  const profile = team ? getWorldCupTeamProfile(team.name) : null;

  if (!team) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={`${styles.drawer} ${team ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <div className={styles.teamInfo}>
            {team.logo && (
              <img src={team.logo} alt="" width={40} height={40} className={styles.teamLogo} />
            )}
            <div>
              <div className={styles.teamName}>{team.name}</div>
              <div className={styles.teamGroup}>Group {team.groupName}</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Kapat">✕</button>
        </div>

        <div className={styles.drawerBody}>
          {/* Takım Künyesi */}
          {profile && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Takım Künyesi</h3>
              <div className={styles.statGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{profile.titles}</div>
                  <div className={styles.statLabel}>Şampiyonluk</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{profile.totalAppearances}</div>
                  <div className={styles.statLabel}>WC Katılımı</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{profile.squadValue}</div>
                  <div className={styles.statLabel}>Kadro Değeri</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValueSmall}>{profile.bestFinish}</div>
                  <div className={styles.statLabel}>En İyi Derece</div>
                </div>
              </div>

              <div className={styles.starPlayer}>
                <span className={styles.starBadge}>Yıldız Oyuncu</span>
                <div className={styles.starInfo}>
                  <span className={styles.starName}>{profile.starPlayer.name}</span>
                  <span className={styles.starMeta}>
                    {profile.starPlayer.club} · {profile.starPlayer.value}
                  </span>
                </div>
              </div>

              {profile.funFacts.length > 0 && (
                <ul className={styles.factList}>
                  {profile.funFacts.map((fact, i) => (
                    <li key={i} className={styles.factItem}>{fact}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Grup Maçları */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Grup Maçları</h3>
            {teamGroupMatches.length === 0 ? (
              <p className={styles.empty}>Grup maçları yüklenemedi.</p>
            ) : (
              <div className={styles.matchList}>
                {teamGroupMatches.map((m) => {
                  const isHome = m.home?.id === team.teamId;
                  const opponent = isHome ? m.away : m.home;
                  const score = m.scores?.ft_score || m.scores?.score || m.score;
                  return (
                    <div key={m.id} className={styles.matchItem}>
                      <div className={styles.matchDate}>
                        {m.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'}
                        {' '}
                        <span className={styles.matchTime}>{utcTimeToTr(m.scheduled ?? m.time ?? '', m.date)}</span>
                      </div>
                      <div className={styles.matchOpponent}>
                        {opponent?.logo && (
                          <img src={opponent.logo} alt="" width={20} height={20} className={styles.opponentLogo} />
                        )}
                        <span className={styles.opponentName}>{isHome ? 'vs ' : '@ '}{opponent?.name ?? '?'}</span>
                      </div>
                      <div className={styles.matchResult}>
                        {score ? (
                          <span className={styles.score}>{score}</span>
                        ) : (
                          <span className={styles.matchLocation}>{m.location ? `📍 ${m.location}` : ''}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Dünya Kupası Tarihi */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Dünya Kupası Tarihi</h3>
            {historyLoading ? (
              <p className={styles.loading}>Yükleniyor...</p>
            ) : history.length === 0 ? (
              <p className={styles.empty}>Geçmiş veri bulunamadı.</p>
            ) : (
              <div className={styles.historyList}>
                {history.map((season) => (
                  <div key={season.seasonId} className={styles.historyItem}>
                    <div className={styles.historyYear}>{season.year}</div>
                    <div className={styles.historyBest}>{season.bestRound}</div>
                    <div className={styles.historyStats}>
                      {season.matches.length} maç
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
