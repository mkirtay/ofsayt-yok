import { useEffect, useState } from 'react';
import Image from 'next/image';
import styles from './matchCard.module.scss';
import { Match } from '@/models/liveScore';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { utcTimeToTr, isoDateToTr } from '@/utils/dateFormat';
import { parseHead2HeadTeamIds, overallFormToPills, type FormPill } from '@/utils/matchForm';
import { buildMatchHref } from '@/utils/matchUrl';
import { getTeamsHead2Head, type Head2HHistoricalMatch } from '@/services/liveScoreService';
import StadiumIcon from '@/components/icons/StadiumIcon';
import WhistleIcon from '@/components/icons/WhistleIcon';
import { MatchCardSkeleton } from '@/components/Skeleton';

interface MatchCardProps {
  match: Match | null;
  loading?: boolean;
}

/** Returns the date/time portion only (no "Tarih :" prefix). */
function getMatchCardDateTimeText(match: Match): string {
  const date = match.date?.trim();
  const scheduled = match.scheduled?.trim();
  if (date) {
    const datePart = isoDateToTr(date);
    if (scheduled && /^\d{2}:\d{2}$/.test(scheduled)) {
      return `${datePart} ${utcTimeToTr(scheduled, date)}`;
    }
    return datePart;
  }
  if (scheduled) {
    return utcTimeToTr(scheduled);
  }
  const added = match.added?.trim();
  if (added) {
    const [d, t] = added.split(/\s+/);
    if (d && t) {
      const hm = t.slice(0, 5);
      return `${isoDateToTr(d)} ${utcTimeToTr(hm, d)}`;
    }
  }
  return '—';
}

function formatTrDate(isoDate: string | undefined): string {
  if (!isoDate?.trim()) return '—';
  const p = isoDate.trim().split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : isoDate;
}

function compactHt(ht: string | undefined): string {
  if (!ht?.trim()) return '—';
  return ht.replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
}

function formatHtScoreDisplay(ht: string | undefined): string {
  if (!ht?.trim()) return '';
  return ht.trim().replace(/\s*-\s*/g, ' - ');
}

/** Parses a score string into home/away parts. */
function parseDisplayScore(raw: string): { home: string; away: string } {
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (m) return { home: m[1].trim(), away: m[2].trim() };
  return { home: s || '—', away: '' };
}

export default function MatchCard({ match, loading }: MatchCardProps) {
  const { t } = useTranslation('match');
  const [homeForm, setHomeForm] = useState<FormPill[]>([]);
  const [awayForm, setAwayForm] = useState<FormPill[]>([]);
  const [homeH2hForm, setHomeH2hForm] = useState<FormPill[]>([]);
  const [awayH2hForm, setAwayH2hForm] = useState<FormPill[]>([]);
  const [h2hHistory, setH2hHistory] = useState<Head2HHistoricalMatch[]>([]);

  function h2hRowStatus(row: Head2HHistoricalMatch): string {
    if (row.status === 'FINISHED') return t('fullTime');
    if (row.status === 'HALF TIME BREAK') return t('halfTime');
    return row.time?.trim() || '—';
  }

  function minuteBadgeLabel(status: string, time: string): string | null {
    const tm = time.trim();
    if (status === 'IN PLAY') return tm ? `${tm}'` : null;
    if (status === 'FINISHED') return t('fullTime');
    if (status === 'HALF TIME BREAK') return tm ? `${tm}'` : null;
    return null;
  }

  function FormPillBox({ pill }: { pill: FormPill }) {
    const cls =
      pill.variant === 'win'
        ? styles.formPillWin
        : pill.variant === 'loss'
          ? styles.formPillLoss
          : styles.formPillDraw;
    const title =
      pill.variant === 'win'
        ? t('formWin')
        : pill.variant === 'loss'
          ? t('formLoss')
          : t('formDraw');
    return (
      <span className={`${styles.formPill} ${cls}`} title={title}>
        {pill.letter}
      </span>
    );
  }

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

  if (loading) {
    return <MatchCardSkeleton />;
  }

  if (!match) {
    return <div className={styles.matchCard}>{t('noMatchInfo')}</div>;
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
  const { home: scoreHome, away: scoreAway } = parseDisplayScore(score);
  const htScore = match.scores?.ht_score;
  const matchStatus = match.status || '';
  const matchTime = match.time || '';
  const location = match.location || '';
  const refereeName = match.referee?.trim() || '';

  const htTrimmed = htScore?.trim() ?? '';
  const showIyBadge = Boolean(htTrimmed) || matchStatus === 'HALF TIME BREAK';
  const minuteBadgeText = minuteBadgeLabel(matchStatus, matchTime);
  const showScoreMeta = showIyBadge || Boolean(minuteBadgeText);
  const showMatchFooter = Boolean(location.trim() || refereeName);

  const showFormRow = homeForm.length > 0 || awayForm.length > 0;
  const showH2hFormRow = homeH2hForm.length > 0 || awayH2hForm.length > 0;
  const showH2hTable = h2hHistory.length > 0;

  const preOdds = match.odds?.pre;
  const showOddsStrip =
    preOdds != null &&
    (preOdds['1'] != null || preOdds['X'] != null || preOdds['2'] != null);

  return (
    <div className={styles.matchCard}>
      <header className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          {compLogo ? (
            <Image src={compLogo} alt="" className={styles.cardHeaderLogo} width={22} height={22} unoptimized />
          ) : showCountryFlag ? (
            <Image
              src={countryFlagImgSrc(country!.id)}
              alt=""
              className={styles.cardHeaderFlag}
              width={22}
              height={16}
              unoptimized
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
        <div className={styles.cardHeaderRight}>{t('date')} : {getMatchCardDateTimeText(match)}</div>
      </header>

      <div className={styles.teamsContainer}>
        <div className={styles.teamsTopRow}>
          <div className={styles.team}>
            <Link href={`/teams/${match.home?.id || ''}`} className={styles.teamLink}>
              {homeLogo ? (
                <Image src={homeLogo} alt={homeName} className={styles.logo} width={56} height={56} unoptimized />
              ) : (
                <div className={styles.logoPlaceholder}>{homeName.charAt(0)}</div>
              )}
              <div className={styles.teamName}>{homeName}</div>
            </Link>
          </div>

          <div className={styles.scoreContainer}>
            {minuteBadgeText ? <span className={styles.minuteBadge}>{minuteBadgeText}</span> : null}
            <div className={styles.score} aria-label={score}>
              <span className={styles.scoreHome}>{scoreHome}</span>
              {scoreAway !== '' ? (
                <>
                  <span className={styles.scoreSep} aria-hidden>
                    –
                  </span>
                  <span className={styles.scoreAway}>{scoreAway}</span>
                </>
              ) : null}
            </div>
            {showScoreMeta ? (
              <div className={styles.scoreMeta}>
                {showIyBadge ? <span className={styles.htBadge}>{t('halfTime')} : {formatHtScoreDisplay(htScore)}</span> : null}
              </div>
            ) : null}
          </div>

          <div className={styles.team}>
            <Link href={`/teams/${match.away?.id || ''}`} className={styles.teamLink}>
              {awayLogo ? (
                <Image src={awayLogo} alt={awayName} className={styles.logo} width={56} height={56} unoptimized />
              ) : (
                <div className={styles.logoPlaceholder}>{awayName.charAt(0)}</div>
              )}
              <div className={styles.teamName}>{awayName}</div>
            </Link>
          </div>
        </div>

        {showOddsStrip && preOdds ? (
          <div className={styles.oddsStrip} aria-label={t('oddsLabel')}>
            <div className={styles.oddsCell}>
              <span className={styles.oddsLabel}>1</span>
              <span className={styles.oddsValue}>{preOdds['1'] ?? '—'}</span>
            </div>
            <div className={styles.oddsCell}>
              <span className={styles.oddsLabel}>X</span>
              <span className={styles.oddsValue}>{preOdds['X'] ?? '—'}</span>
            </div>
            <div className={styles.oddsCell}>
              <span className={styles.oddsLabel}>2</span>
              <span className={styles.oddsValue}>{preOdds['2'] ?? '—'}</span>
            </div>
          </div>
        ) : null}
      </div>

      {showMatchFooter ? (
        <div className={styles.matchFooter}>
          <div className={styles.matchFooterCol}>
            <StadiumIcon className={styles.matchFooterIcon} />
            <span className={styles.matchFooterLabel}>{t('stadium')}</span>
            <span className={styles.matchFooterValue}>{location.trim() || '—'}</span>
          </div>
          <div className={styles.matchFooterCol}>
            <WhistleIcon className={styles.matchFooterIcon} />
            <span className={styles.matchFooterLabel}>{t('referee')}</span>
            <span className={styles.matchFooterValue}>{refereeName || '—'}</span>
          </div>
        </div>
      ) : null}

      {showFormRow ? (
        <div className={styles.formRow}>
          <div className={styles.formSide}>
            <span className={styles.formLabel}>{t('last5')}</span>
            <div className={styles.formPills}>
              {homeForm.map((pill, i) => (
                <FormPillBox key={i} pill={pill} />
              ))}
            </div>
          </div>
          <div className={`${styles.formSide} ${styles.formSideAway}`}>
            <span className={styles.formLabel}>{t('last5')}</span>
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
            <span className={styles.formLabel}>{t('h2hLast5')}</span>
            <div className={styles.formPills}>
              {homeH2hForm.map((pill, i) => (
                <FormPillBox key={`h2h-h-${i}`} pill={pill} />
              ))}
            </div>
          </div>
          <div className={`${styles.formSide} ${styles.formSideAway}`}>
            <span className={styles.formLabel}>{t('h2hLast5')}</span>
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
          <div className={styles.h2hTableTitle}>{t('h2hHistory')}</div>
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
                  <th>{t('h2hDate')}</th>
                  <th>{t('h2hTime')}</th>
                  <th>{t('h2hStatus')}</th>
                  <th className={styles.h2hThHome}>{t('h2hHome')}</th>
                  <th>{t('h2hScore')}</th>
                  <th className={styles.h2hThAway}>{t('h2hAway')}</th>
                  <th>{t('h2hHt')}</th>
                </tr>
              </thead>
              <tbody>
                {h2hHistory.map((row) => (
                  <tr key={row.id} className={styles.h2hTr}>
                    <td>{formatTrDate(row.date)}</td>
                    <td>{row.scheduled?.trim() ? utcTimeToTr(row.scheduled.trim(), row.date) : '—'}</td>
                    <td>{h2hRowStatus(row)}</td>
                    <td className={styles.h2hTdHome}>{row.home_name || '—'}</td>
                    <td className={styles.h2hTdScore}>
                      <Link href={buildMatchHref({ id: Number(row.id), home_name: row.home_name, away_name: row.away_name })} className={styles.h2hScoreLink} prefetch={false}>
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
