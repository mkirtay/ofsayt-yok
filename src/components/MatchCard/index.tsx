import { useEffect, useState } from 'react';
import styles from './matchCard.module.scss';
import { Match } from '@/models/liveScore';
import Link from 'next/link';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { parseHead2HeadTeamIds, overallFormToPills, type FormPill } from '@/utils/matchForm';
import { getTeamsHead2Head, type Head2HHistoricalMatch } from '@/services/liveScoreService';
import StadiumIcon from '@/components/icons/StadiumIcon';

interface MatchCardProps {
  match: Match | null;
}

/** Maç detay kartı: `Tarih : 28.03.2026 22:30` (API `date` + `scheduled` / yedek `added`) */
function formatMatchCardDateTime(match: Match): string {
  const date = match.date?.trim();
  const scheduled = match.scheduled?.trim();
  if (date) {
    const parts = date.split('-');
    const datePart =
      parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : date;
    if (scheduled && /^\d{2}:\d{2}$/.test(scheduled)) {
      return `Tarih : ${datePart} ${scheduled}`;
    }
    return `Tarih : ${datePart}`;
  }
  if (scheduled) {
    return `Tarih : ${scheduled}`;
  }
  const added = match.added?.trim();
  if (added) {
    const [d, t] = added.split(/\s+/);
    if (d && t) {
      const dp = d.split('-');
      if (dp.length === 3) {
        const hm = t.slice(0, 5);
        return `Tarih : ${dp[2]}.${dp[1]}.${dp[0]} ${hm}`;
      }
    }
  }
  return 'Tarih : —';
}

function formatTrDate(isoDate: string | undefined): string {
  if (!isoDate?.trim()) return '—';
  const p = isoDate.trim().split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : isoDate;
}

function h2hRowStatus(row: Head2HHistoricalMatch): string {
  if (row.status === 'FINISHED') return 'MS';
  if (row.status === 'HALF TIME BREAK') return 'İY';
  return row.time?.trim() || '—';
}

function compactHt(ht: string | undefined): string {
  if (!ht?.trim()) return '—';
  return ht.replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
}

function FormPillBox({ pill }: { pill: FormPill }) {
  const cls =
    pill.variant === 'win'
      ? styles.formPillWin
      : pill.variant === 'loss'
        ? styles.formPillLoss
        : styles.formPillDraw;
  return (
    <span className={`${styles.formPill} ${cls}`} title={pill.variant === 'win' ? 'Galibiyet' : pill.variant === 'loss' ? 'Mağlubiyet' : 'Beraberlik'}>
      {pill.letter}
    </span>
  );
}

export default function MatchCard({ match }: MatchCardProps) {
  const [homeForm, setHomeForm] = useState<FormPill[]>([]);
  const [awayForm, setAwayForm] = useState<FormPill[]>([]);
  const [homeH2hForm, setHomeH2hForm] = useState<FormPill[]>([]);
  const [awayH2hForm, setAwayH2hForm] = useState<FormPill[]>([]);
  const [h2hHistory, setH2hHistory] = useState<Head2HHistoricalMatch[]>([]);

  useEffect(() => {
    if (!match?.home?.id || !match?.away?.id) {
      setHomeForm([]);
      setAwayForm([]);
      setHomeH2hForm([]);
      setAwayH2hForm([]);
      setH2hHistory([]);
      return;
    }

    const parsed = parseHead2HeadTeamIds(match.urls?.head2head);
    const team1Id = parsed?.team1Id ?? String(match.home.id);
    const team2Id = parsed?.team2Id ?? String(match.away.id);

    let cancelled = false;
    (async () => {
      const data = await getTeamsHead2Head(team1Id, team2Id);
      if (cancelled || !data) {
        if (!cancelled) {
          setHomeForm([]);
          setAwayForm([]);
          setHomeH2hForm([]);
          setAwayH2hForm([]);
          setH2hHistory([]);
        }
        return;
      }
      const homeId = match.home!.id;
      const team1IsHome = Number(data.team1.id) === homeId;
      const homeOverall = team1IsHome ? data.team1.overall_form : data.team2.overall_form;
      const awayOverall = team1IsHome ? data.team2.overall_form : data.team1.overall_form;
      const homeH2h = team1IsHome ? data.team1.h2h_form : data.team2.h2h_form;
      const awayH2h = team1IsHome ? data.team2.h2h_form : data.team1.h2h_form;
      setHomeForm(overallFormToPills(homeOverall, 5));
      setAwayForm(overallFormToPills(awayOverall, 5));
      setHomeH2hForm(overallFormToPills(homeH2h, 5));
      setAwayH2hForm(overallFormToPills(awayH2h, 5));
      setH2hHistory(Array.isArray(data.h2h) ? data.h2h : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [match?.id, match?.urls?.head2head, match?.home?.id, match?.away?.id]);

  if (!match) {
    return <div className={styles.matchCard}>Maç bilgisi bulunamadı</div>;
  }

  const compName = match.competition?.name || '';
  const compLogo = match.competition?.logo;
  const country = match.country;
  const showCountryFlag = !compLogo && country?.id != null;
  const homeName = match.home?.name || '';
  const awayName = match.away?.name || '';
  const homeLogo = match.home?.logo;
  const awayLogo = match.away?.logo;
  const score = match.scores?.score || '? - ?';
  const htScore = match.scores?.ht_score;
  const matchStatus = match.status || '';
  const matchTime = match.time || '';
  const location = match.location || '';

  const statusLabel =
    matchStatus === 'IN PLAY'
      ? `${matchTime}'`
      : matchStatus === 'FINISHED'
        ? 'MS'
        : matchStatus === 'HALF TIME BREAK'
          ? 'İY'
          : matchTime;

  const showFormRow = homeForm.length > 0 || awayForm.length > 0;
  const showH2hFormRow = homeH2hForm.length > 0 || awayH2hForm.length > 0;
  const showH2hTable = h2hHistory.length > 0;

  return (
    <div className={styles.matchCard}>
      <header className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          {compLogo ? (
            <img src={compLogo} alt="" className={styles.cardHeaderLogo} width={22} height={22} />
          ) : showCountryFlag ? (
            <img
              src={countryFlagImgSrc(country!.id)}
              alt=""
              className={styles.cardHeaderFlag}
              width={22}
              height={16}
            />
          ) : null}
          <span className={styles.cardHeaderTitle}>
            {country?.name ? (
              <>
                <strong className={styles.cardHeaderCountry}>{country.name}</strong>
                <span className={styles.cardHeaderSep}> - </span>
              </>
            ) : null}
            <span className={styles.cardHeaderLeague}>{compName}</span>
          </span>
        </div>
        <div className={styles.cardHeaderRight}>{formatMatchCardDateTime(match)}</div>
      </header>

      <div className={styles.teamsContainer}>
        <div className={styles.team}>
          <Link href={`/teams/${match.home?.id || ''}`} className={styles.teamLink}>
            {homeLogo ? (
              <img src={homeLogo} alt={homeName} className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>{homeName.charAt(0)}</div>
            )}
            <div className={styles.teamName}>{homeName}</div>
          </Link>
        </div>

        <div className={styles.scoreContainer}>
          <div
            className={`${styles.statusBadge} ${
              matchStatus === 'IN PLAY' ? styles.statusBadgeLive : ''
            }`}
          >
            {statusLabel}
          </div>
          <div className={styles.score}>{score}</div>
          {htScore ? <div className={styles.htScore}>İY: {htScore}</div> : null}
        </div>

        <div className={styles.team}>
          <Link href={`/teams/${match.away?.id || ''}`} className={styles.teamLink}>
            {awayLogo ? (
              <img src={awayLogo} alt={awayName} className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>{awayName.charAt(0)}</div>
            )}
            <div className={styles.teamName}>{awayName}</div>
          </Link>
        </div>
      </div>
      
      {location ? (
        <div className={styles.location}>
          <span className={styles.locationInner}>
            <StadiumIcon className={styles.stadiumIcon} />
            <span>{location}</span>
          </span>
        </div>
      ) : null}

      {showFormRow ? (
        <div className={styles.formRow}>
          <div className={styles.formSide}>
            <span className={styles.formLabel}>Son 5 Maç :</span>
            <div className={styles.formPills}>
              {homeForm.map((pill, i) => (
                <FormPillBox key={i} pill={pill} />
              ))}
            </div>
          </div>
          <div className={`${styles.formSide} ${styles.formSideAway}`}>
            <span className={styles.formLabel}>Son 5 Maç :</span>
            <div className={styles.formPills}>
              {awayForm.map((pill, i) => (
                <FormPillBox key={i} pill={pill} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showH2hFormRow ? (
        <div className={`${styles.formRow} ${styles.formRowH2h}`}>
          <div className={styles.formSide}>
            <span className={styles.formLabel}>Karşılıklı son 5 :</span>
            <div className={styles.formPills}>
              {homeH2hForm.map((pill, i) => (
                <FormPillBox key={`h2h-h-${i}`} pill={pill} />
              ))}
            </div>
          </div>
          <div className={`${styles.formSide} ${styles.formSideAway}`}>
            <span className={styles.formLabel}>Karşılıklı son 5 :</span>
            <div className={styles.formPills}>
              {awayH2hForm.map((pill, i) => (
                <FormPillBox key={`h2h-a-${i}`} pill={pill} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showH2hTable ? (
        <div className={styles.h2hTableWrap}>
          <div className={styles.h2hTableTitle}>Karşılaşma geçmişi</div>
          <div className={styles.h2hTableScroll}>
            <table className={styles.h2hTable}>
              <colgroup>
                <col className={styles.h2hColDate} />
                <col className={styles.h2hColTime} />
                <col className={styles.h2hColStatus} />
                <col className={styles.h2hColHome} />
                <col className={styles.h2hColScore} />
                <col className={styles.h2hColAway} />
                <col className={styles.h2hColHt} />
              </colgroup>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Saat</th>
                  <th>Durum</th>
                  <th className={styles.h2hThHome}>Ev sahibi</th>
                  <th>Skor</th>
                  <th className={styles.h2hThAway}>Deplasman</th>
                  <th>İY</th>
                </tr>
              </thead>
              <tbody>
                {h2hHistory.map((row) => (
                  <tr key={row.id} className={styles.h2hTr}>
                    <td>{formatTrDate(row.date)}</td>
                    <td>{row.scheduled?.trim() || '—'}</td>
                    <td>{h2hRowStatus(row)}</td>
                    <td className={styles.h2hTdHome}>{row.home_name || '—'}</td>
                    <td className={styles.h2hTdScore}>
                      <Link href={`/matches/${row.id}`} className={styles.h2hScoreLink} prefetch={false}>
                        {row.score?.trim() || '—'}
                      </Link>
                    </td>
                    <td className={styles.h2hTdAway}>{row.away_name || '—'}</td>
                    <td>{compactHt(row.ht_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
