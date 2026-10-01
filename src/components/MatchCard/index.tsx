import { useEffect, useState } from 'react';
import styles from './matchCard.module.scss';
import { Match } from '@/models/liveScore';
import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import { useNow } from '@/hooks/useNow';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import { kickoffInfo, relativeKickoffDay } from '@/utils/kickoff';
import { formatFixtureDate } from '@/utils/fixtureDateLabel';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { utcTimeToTr, isoDateToTr } from '@/utils/dateFormat';
import { h2hTeamKey, overallFormToPills, type FormPill } from '@/utils/matchForm';
import { buildMatchHref } from '@/utils/matchUrl';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { leagueNameById } from '@/utils/leagueName';
import TeamTierBadge from '@/components/TeamTierBadge';
import { useTurkeyTeamTiers } from '@/hooks/useTurkeyTeamTiers';
import { isTurkishCupMatch } from '@/utils/cupTeamTier';
import { getTeamsHead2Head, type Head2HeadData, type Head2HHistoricalMatch } from '@/services/liveScoreService';
import StadiumIcon from '@/components/icons/StadiumIcon';
import WhistleIcon from '@/components/icons/WhistleIcon';
import { MatchCardSkeleton } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';

interface MatchCardProps {
  match: Match | null;
  loading?: boolean;
  /**
   * SSR'da çözülmüş form + karşılaşma geçmişi (kart sonradan uzamasın). `null`: veri yok; verilmezse (undefined)
   * istemci çeker ve yer iskeletle ayrılır.
   */
  initialH2h?: Head2HeadData | null;
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

export default function MatchCard({ match, loading, initialH2h }: MatchCardProps) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  // Form + karşılaşma geçmişi tek state'te, takım çiftine bağlı. SSR verdiyse onunla başlar (istek yok, kart uzamaz).
  const teamKey = h2hTeamKey(match);
  const [h2h, setH2h] = useState<{ key: string; data: Head2HeadData | null } | null>(() =>
    teamKey && initialH2h !== undefined ? { key: teamKey.key, data: initialH2h } : null,
  );

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
    if (!teamKey || h2h?.key === teamKey.key) return;
    let cancelled = false;
    const { key, team1Id, team2Id } = teamKey;
    getTeamsHead2Head(team1Id, team2Id).then(
      (data) => {
        if (!cancelled) setH2h({ key, data });
      },
      () => {
        if (!cancelled) setH2h({ key, data: null });
      },
    );
    return () => {
      cancelled = true;
    };
    // teamKey her render'da yeni nesne; anahtar dizesi yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey?.key, h2h?.key]);

  // undefined = bu takım çifti için henüz gelmedi (iskelet), null = veri yok.
  const h2hData = teamKey && h2h?.key === teamKey.key ? h2h.data : teamKey ? undefined : null;
  const h2hPending = h2hData === undefined;
  const team1IsHome = h2hData ? Number(h2hData.team1.id) === match?.home?.id : true;
  const homeForm: FormPill[] = h2hData ? overallFormToPills((team1IsHome ? h2hData.team1 : h2hData.team2).overall_form, 5) : [];
  const awayForm: FormPill[] = h2hData ? overallFormToPills((team1IsHome ? h2hData.team2 : h2hData.team1).overall_form, 5) : [];
  const homeH2hForm: FormPill[] = h2hData ? overallFormToPills((team1IsHome ? h2hData.team1 : h2hData.team2).h2h_form, 5) : [];
  const awayH2hForm: FormPill[] = h2hData ? overallFormToPills((team1IsHome ? h2hData.team2 : h2hData.team1).h2h_form, 5) : [];
  const h2hHistory: Head2HHistoricalMatch[] = h2hData && Array.isArray(h2hData.h2h) ? h2hData.h2h : [];

  // Kupa maçında takım kademe rozeti için harita (yalnızca Türkiye Kupası maçında istenir).
  const cupTiers = useTurkeyTeamTiers(isTurkishCupMatch(match)).data ?? null;

  // Maç öncesi: skor yerine başlama saati + gün. "Bugün/Yarın" saate bağlı → yalnız mount sonrası (SSR'da tarih).
  const { t: ts } = useTranslation('matchState');
  const { locale } = useI18n();
  const displayState = matchDisplayState(match);
  const kickoff = displayState.phase === 'PRE' ? kickoffInfo(match) : null;
  const now = useNow(60_000, kickoff != null);

  if (loading) {
    return <MatchCardSkeleton />;
  }

  if (!match) {
    return <div className={styles.matchCard}>{t('noMatchInfo')}</div>;
  }

  const compName = leagueNameById(match.competition?.id, match.competition?.name, tl, 'full');
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
  const { phase, special } = displayState;
  // Yarıda kaldı / durduruldu / hükmen: skor kalır, dakika rozetinin yerine durum.
  const minuteBadgeText = special && specialKeepsData(special) ? ts(`short.${special}`) : minuteBadgeLabel(matchStatus, matchTime);
  const showScoreMeta = showIyBadge || Boolean(minuteBadgeText);
  const isPre = phase === 'PRE';
  // Skor yokken: ertelendi / iptal / tarih belirsiz / gecikti → kısa durum; başlamadı → saat + gün.
  const noScore = !match.scores?.score;
  const scoreStateLabel = noScore && special && !specialKeepsData(special) ? ts(`short.${special}`) : null;
  const showKickoff = noScore && isPre && !scoreStateLabel && kickoff != null;
  const relativeDay = showKickoff && now != null ? relativeKickoffDay(kickoff.dayIso, now) : null;
  const kickoffDayText = showKickoff
    ? relativeDay
      ? ts(`day.${relativeDay}`)
      : formatFixtureDate(kickoff.dayIso, locale)
    : '';
  // Ertelendi / iptal / tarih belirsiz: üst satırda eski tarih geçerli gibi görünmesin → durum + soluk, üstü çizili tarih.
  const headerDateState = special === 'postponed' || special === 'cancelled' || special === 'tba' ? special : null;
  const refereeText = refereeName || (isPre && !special ? ts('refereeTba') : '—');
  const showMatchFooter = Boolean(location.trim() || refereeName) || (isPre && !special);

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
            <TeamLogo
              src={compLogo}
              alt=""
              className={`${styles.cardHeaderLogo} ${
                competitionLogoNeedsBackdrop(match.competition?.id) ? styles.logoBackdrop : ''
              }`.trim()}
              width={22}
              height={22}
            />
          ) : showCountryFlag ? (
            <TeamLogo
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
        <div className={styles.cardHeaderRight}>
          {t('date')} :{' '}
          {headerDateState ? (
            <>
              <span className={styles.headerDateState}>{ts(`headerDate.${headerDateState}`)}</span>{' '}
              <s className={styles.headerDateOld}>{getMatchCardDateTimeText(match)}</s>
            </>
          ) : (
            getMatchCardDateTimeText(match)
          )}
        </div>
      </header>

      <div className={styles.teamsContainer}>
        <div className={styles.teamsTopRow}>
          <div className={styles.team}>
            <Link href={`/teams/${match.home?.id || ''}`} className={styles.teamLink}>
              {homeLogo ? (
                <TeamLogo src={homeLogo} alt={homeName} className={styles.logo} width={56} height={56} />
              ) : (
                <div className={styles.logoPlaceholder}>{homeName.charAt(0)}</div>
              )}
              <div className={styles.teamName}>{homeName}</div>
              <TeamTierBadge match={match} teamId={match.home?.id} tiers={cupTiers} />
            </Link>
          </div>

          <div className={styles.scoreContainer}>
            {minuteBadgeText ? (
              <span
                className={`${styles.minuteBadge} ${
                  matchStatus === 'IN PLAY'
                    ? styles.minuteBadgeLive
                    : matchStatus === 'FINISHED'
                      ? styles.minuteBadgeFinished
                      : ''
                }`}
              >
                {minuteBadgeText}
              </span>
            ) : null}
            {showKickoff ? (
              <div className={styles.kickoff}>
                <span className={styles.kickoffTime}>{kickoff.time}</span>
                <span className={styles.kickoffDay}>{kickoffDayText}</span>
              </div>
            ) : scoreStateLabel ? (
              <div className={styles.scoreState}>{scoreStateLabel}</div>
            ) : (
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
            )}
            {showScoreMeta ? (
              <div className={styles.scoreMeta}>
                {showIyBadge ? <span className={styles.htBadge}>{t('halfTime')} : {formatHtScoreDisplay(htScore)}</span> : null}
              </div>
            ) : null}
          </div>

          <div className={styles.team}>
            <Link href={`/teams/${match.away?.id || ''}`} className={styles.teamLink}>
              {awayLogo ? (
                <TeamLogo src={awayLogo} alt={awayName} className={styles.logo} width={56} height={56} />
              ) : (
                <div className={styles.logoPlaceholder}>{awayName.charAt(0)}</div>
              )}
              <div className={styles.teamName}>{awayName}</div>
              <TeamTierBadge match={match} teamId={match.away?.id} tiers={cupTiers} />
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
            <span className={styles.matchFooterValue}>{refereeText}</span>
          </div>
        </div>
      ) : null}

      {h2hPending ? (
        // SSR vermediyse (bütçe aşıldı / panel): gelecek bölümün yeri baştan ayrılır — kart sonradan az uzar.
        <div aria-hidden="true">
          {[styles.formRow, `${styles.formRow} ${styles.formRowH2h}`].map((rowClass) => (
            <div key={rowClass} className={rowClass}>
              {[styles.formSide, `${styles.formSide} ${styles.formSideAway}`].map((sideClass) => (
                <div key={sideClass} className={sideClass}>
                  <span className={`${styles.formLabel} ${styles.skeletonText}`}>&nbsp;</span>
                  <div className={styles.formPills}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={`${styles.formPill} ${styles.formPillSkeleton}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className={styles.h2hTableWrap}>
            <div className={`${styles.h2hTableTitle} ${styles.skeletonText}`}>&nbsp;</div>
            <div className={styles.h2hSkeletonRows}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={styles.h2hSkeletonRow} />
              ))}
            </div>
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
