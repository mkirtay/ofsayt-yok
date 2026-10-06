import { useRouter } from 'next/router';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { useTranslation } from '@/lib/i18n';
import Avatar from '@/components/Avatar';
import StandingTeamName from '@/components/StandingTeamName';
import TeamLogo from '@/components/TeamLogo';
import { getStandingRankZone, type StandingsZoneKind } from '@/config/standingsZones';
import type { CompetitionTableStandingRow, TopScorerEntry } from '@/services/liveScoreService';
import type { DisciplinaryRow } from '@/services/sportmonksKatman2Mapper';
import { standingTeamFullName } from '@/utils/standingsTeamLabel';
import styles from './standingsView.module.scss';

export type StandingsBlock = { key: string; title?: string; rows: CompetitionTableStandingRow[] };

const ZONE_LEGEND_KEYS: Record<StandingsZoneKind, string> = {
  ucl: 'zoneUcl',
  ucl_qual: 'zoneUclQual',
  europa: 'zoneEuropa',
  conference_qual: 'zoneConference',
  promotion: 'zonePromotion',
  playoff: 'zonePlayoff',
  uefa_league_playoff: 'zoneUefaPlayoff',
  relegation: 'zoneRelegation',
};

const teamIdOf = (r: CompetitionTableStandingRow): number | undefined => {
  const id = r.team?.id ?? r.team_id;
  return id != null ? Number(id) : undefined;
};

function FormDots({ form, className, hidden }: { form: Array<'W' | 'D' | 'L'>; className: string; hidden?: boolean }) {
  const { t } = useTranslation('standings');
  const labelOf = { W: t('formWin'), D: t('formDraw'), L: t('formLoss') } as const;
  return (
    <span
      className={className}
      {...(hidden ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${t('colForm')}: ${form.map((f) => labelOf[f]).join(', ')}` })}
    >
      {form.map((f, i) => (
        <i key={i} className={`${styles.dot} ${f === 'W' ? styles.dotW : f === 'D' ? styles.dotD : styles.dotL}`} />
      ))}
    </span>
  );
}

function Legend({ zones }: { zones: StandingsZoneKind[] }) {
  const { t } = useTranslation('standings');
  if (zones.length === 0) return null;
  return (
    <ul className={styles.legend} aria-label={t('legendLabel')}>
      {zones.map((z) => (
        <li key={z}>
          <i className={styles.legendSwatch} data-zone={z} aria-hidden="true" />
          {t(ZONE_LEGEND_KEYS[z])}
        </li>
      ))}
    </ul>
  );
}

/** Puan tablosu: sabit başlık, sıra renk bandı + açıklama, son 5 maç formu; satır tıklanınca takım sayfası. */
export function StandingsTable({ blocks, competitionId }: { blocks: StandingsBlock[]; competitionId?: number }) {
  const { t } = useTranslation('standings');
  const router = useRouter();
  const zones = new Set<StandingsZoneKind>();

  const goToTeam = (e: MouseEvent<HTMLTableRowElement>, id: number | undefined) => {
    if (id == null || (e.target as HTMLElement).closest('a')) return;
    void router.push(`/teams/${id}`);
  };

  return (
    <>
      {blocks.map((block) => {
        const total = block.rows.length;
        return (
          <div key={block.key} className={styles.tableWrap}>
            {block.title ? <h2 className={styles.groupTitle}>{block.title}</h2> : null}
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colRank} scope="col">{t('colRank')}</th>
                  <th className={styles.colTeam} scope="col">{t('colTeam')}</th>
                  <th scope="col">{t('colPlayed')}</th>
                  <th className={styles.optional} scope="col">{t('colWon')}</th>
                  <th className={styles.optional} scope="col">{t('colDrawn')}</th>
                  <th className={styles.optional} scope="col">{t('colLost')}</th>
                  <th className={styles.optional} scope="col">{t('colFor')}</th>
                  <th className={styles.optional} scope="col">{t('colAgainst')}</th>
                  <th scope="col">{t('colDiff')}</th>
                  <th className={styles.colPoints} scope="col">{t('colPoints')}</th>
                  <th className={`${styles.optional} ${styles.colForm}`} scope="col">{t('colForm')}</th>
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => {
                  const id = teamIdOf(row);
                  const zone = getStandingRankZone(Number(row.rank), total, competitionId);
                  if (zone) zones.add(zone);
                  const logo = row.team?.logo || row.logo;
                  const name = standingTeamFullName(row);
                  return (
                    <tr
                      key={`${id ?? i}-${row.rank}`}
                      className={id != null ? styles.clickable : undefined}
                      onClick={(e) => goToTeam(e, id)}
                    >
                      <td className={styles.colRank} data-zone={zone ?? undefined}>
                        {row.rank}
                      </td>
                      <td className={styles.colTeam}>
                        <div className={styles.teamCell}>
                          <TeamLogo src={logo} alt="" className={styles.teamLogo} width={20} height={20} />
                          <div className={styles.teamText}>
                            {id != null ? (
                              <Link href={`/teams/${id}`} prefetch={false} className={styles.teamLink} title={name} aria-label={name}>
                                <StandingTeamName row={row} />
                              </Link>
                            ) : (
                              <span className={styles.teamLink} title={name}>
                                <StandingTeamName row={row} />
                              </span>
                            )}
                            {row.form ? <FormDots form={row.form} className={styles.formInline} hidden /> : null}
                          </div>
                        </div>
                      </td>
                      <td>{row.matches}</td>
                      <td className={styles.optional}>{row.won}</td>
                      <td className={styles.optional}>{row.drawn}</td>
                      <td className={styles.optional}>{row.lost}</td>
                      <td className={styles.optional}>{row.goals_scored ?? '—'}</td>
                      <td className={styles.optional}>{row.goals_conceded ?? '—'}</td>
                      <td>{row.goal_diff}</td>
                      <td className={styles.colPoints}>{row.points}</td>
                      <td className={`${styles.optional} ${styles.colForm}`}>
                        {row.form ? <FormDots form={row.form} className={styles.formCol} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <Legend zones={[...zones]} />
    </>
  );
}

const podiumClass = (i: number) => (i === 0 ? styles.gold : i === 1 ? styles.silver : i === 2 ? styles.bronze : '');

function PlayerCell({
  name,
  photo,
  teamName,
  teamLogo,
  teamId,
}: {
  name: string;
  photo?: string | null;
  teamName?: string;
  teamLogo?: string | null;
  teamId?: number;
}) {
  return (
    <div className={styles.playerCell}>
      <span className={styles.photoWrap}>
        <TeamLogo
          src={photo}
          alt=""
          className={styles.photo}
          width={36}
          height={36}
          fallback={<Avatar name={name} size={36} className={styles.avatar} />}
        />
      </span>
      <div className={styles.playerText}>
        <span className={styles.playerName}>{name}</span>
        <span className={styles.playerTeam}>
          <TeamLogo src={teamLogo} alt="" className={styles.miniLogo} width={14} height={14} />
          {teamId != null ? (
            <Link href={`/teams/${teamId}`} prefetch={false} className={styles.teamLink}>
              {teamName}
            </Link>
          ) : (
            teamName
          )}
        </span>
      </div>
    </div>
  );
}

/** Gol krallığı: oyuncu fotoğrafı/avatar, takım logosu, gol + asist; ilk 3 vurgulu. */
export function ScorersList({ rows }: { rows: TopScorerEntry[] }) {
  const { t } = useTranslation('standings');
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colRank} scope="col">{t('colRank')}</th>
          <th className={styles.colTeam} scope="col">{t('colPlayer')}</th>
          <th scope="col">{t('colPlayed')}</th>
          <th scope="col">{t('colAssists')}</th>
          <th className={styles.colPoints} scope="col">{t('colGoals')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={`${s.player?.id ?? i}`} className={podiumClass(i)}>
            <td className={`${styles.colRank} ${styles.rankPlain}`}>{i + 1}</td>
            <td className={styles.colTeam}>
              <PlayerCell
                name={s.player?.name ?? '—'}
                photo={s.player?.photo}
                teamName={s.team?.name}
                teamLogo={s.team?.logo}
                teamId={s.team?.id}
              />
            </td>
            <td>{s.played ?? '—'}</td>
            <td>{s.assists ?? '—'}</td>
            <td className={styles.colPoints}>{s.goals}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Kartlar: sarı/kırmızı sıralaması, aynı kart stili; ilk 3 vurgulu. */
export function CardsList({ rows }: { rows: DisciplinaryRow[] }) {
  const { t } = useTranslation('standings');
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colRank} scope="col">{t('colRank')}</th>
          <th className={styles.colTeam} scope="col">{t('colPlayer')}</th>
          <th scope="col"><i className={`${styles.card} ${styles.cardYellow}`} />
            <span className={styles.srOnly}>{t('colYellow')}</span></th>
          <th className={styles.colPoints} scope="col"><i className={`${styles.card} ${styles.cardRed}`} />
            <span className={styles.srOnly}>{t('colRed')}</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c, i) => (
          <tr key={`${c.player.id}`} className={podiumClass(i)}>
            <td className={`${styles.colRank} ${styles.rankPlain}`}>{i + 1}</td>
            <td className={styles.colTeam}>
              <PlayerCell name={c.player.name} photo={c.player.photo} teamName={c.team.name} teamLogo={c.team.logo} teamId={c.team.id} />
            </td>
            <td>{c.yellow_cards || 0}</td>
            <td className={styles.colPoints}>{c.red_cards || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
