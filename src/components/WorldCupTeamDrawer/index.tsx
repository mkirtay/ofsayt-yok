import { useEffect } from 'react';
import type { GroupedLeagueMatches } from '@/services/liveScoreService';
import type { TeamEntry } from '@/components/WorldCupTeamList';
import { getWorldCupTeamProfile } from '@/data/worldCupTeamProfiles';
import { utcTimeToTr } from '@/utils/dateFormat';
import styles from './teamDrawer.module.scss';
import TeamLogo from '@/components/TeamLogo';

type Props = {
  team: TeamEntry | null;
  groupMatches: GroupedLeagueMatches[];
  onClose: () => void;
};

export default function WorldCupTeamDrawer({ team, groupMatches, onClose }: Props) {
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
              <TeamLogo src={team.logo} alt="" width={40} height={40} className={styles.teamLogo} />
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
                          <TeamLogo src={opponent.logo} alt="" width={20} height={20} className={styles.opponentLogo} />
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

        </div>
      </div>
    </>
  );
}
