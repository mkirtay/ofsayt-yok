import { useEffect, useRef, useState } from 'react';
import styles from './matchCard.module.scss';
import { Match } from '@/models/liveScore';
import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import { useNow } from '@/hooks/useNow';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import { kickoffInfo, relativeKickoffDay } from '@/utils/kickoff';
import { formatFixtureDate } from '@/utils/fixtureDateLabel';
import { h2hTeamKey, overallFormToPills, type FormPill } from '@/utils/matchForm';
import { buildMatchHref } from '@/utils/matchUrl';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { leagueNameById } from '@/utils/leagueName';
import TeamTierBadge from '@/components/TeamTierBadge';
import { useTurkeyTeamTiers } from '@/hooks/useTurkeyTeamTiers';
import { isTurkishCupMatch } from '@/utils/cupTeamTier';
import { getTeamsHead2Head, type Head2HeadData, type Head2HHistoricalMatch } from '@/services/liveScoreService';
import { MatchCardSkeleton } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { impliedProbabilities } from '@/utils/impliedProbability';
import { isSecondLeg } from '@/utils/aggregateScore';
import { finishedLabelKey } from '@/utils/finishLabel';
import { countryDisplayName } from '@/utils/countryName';
import { h2hWinner } from '@/utils/h2hResult';
import TiePill from './TiePill';
import MatchInfoLine, { CoachLink } from './MatchInfoLine';
import RefereeStatsCard from './RefereeStatsCard';
import { useIsDerby } from '@/hooks/useMatchInfoExtras';
import infoStyles from './matchInfo.module.scss';

interface MatchCardProps {
  match: Match | null;
  loading?: boolean;
  /**
   * SSR'da çözülmüş form + karşılaşma geçmişi (kart sonradan uzamasın). `null`: veri yok; verilmezse (undefined)
   * istemci çeker ve yer iskeletle ayrılır.
   */
  initialH2h?: Head2HeadData | null;
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

/** Form + karşılaşma geçmişi iskeleti (form satırı + thead + 5 satır). `className`: ayrılmış kutuda görünmez ölçü olarak. */
function H2hSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <div className={styles.formRow}>
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
      <div className={styles.h2hTableWrap}>
        <div className={`${styles.h2hTableTitle} ${styles.skeletonText}`}>&nbsp;</div>
        <div className={styles.h2hSkeletonRows}>
          {/* "Karşılıklı son 5" satırı kalktı (≈ 2 tablo satırı): toplam yükseklik aynı kalsın diye thead + 5 satır */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={styles.h2hSkeletonRow} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MatchCard({ match, loading, initialH2h }: MatchCardProps) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  // Form + karşılaşma geçmişi tek state'te, takım çiftine bağlı. SSR verdiyse onunla başlar (istek yok, kart uzamaz).
  const teamKey = h2hTeamKey(match);
  const [h2h, setH2h] = useState<{ key: string; data: Head2HeadData | null } | null>(() =>
    teamKey && initialH2h !== undefined ? { key: teamKey.key, data: initialH2h } : null,
  );
  // SSR vermediyse (bütçe aşıldı / panel) bölüm iskelet yüksekliğinde kalır: veri gelince kart uzamaz ya da kısalmaz
  // (CLS). Satır sayısı 0–5 arası değişir; taşan içerik "Tümünü göster" ile açılır (kullanıcı girdisi → CLS sayılmaz).
  const [reserveH2h] = useState(() => initialH2h === undefined);
  const [h2hExpanded, setH2hExpanded] = useState(false);
  const [h2hClipped, setH2hClipped] = useState(false);
  const reservedRef = useRef<HTMLDivElement>(null);

  function minuteBadgeLabel(status: string, time: string): string | null {
    const tm = time.trim();
    if (status === 'IN PLAY') return tm ? `${tm}'` : null;
    if (status === 'FINISHED') return t(match ? finishedLabelKey(match) : 'fullTime');
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
  const h2hReserved = reserveH2h && !h2hExpanded && teamKey != null && !h2hPending;
  useEffect(() => {
    const el = reservedRef.current;
    setH2hClipped(el ? el.scrollHeight > el.clientHeight + 1 : false);
  }, [h2hReserved, h2hData]);
  const team1IsHome = h2hData ? Number(h2hData.team1.id) === match?.home?.id : true;
  const homeForm: FormPill[] = h2hData ? overallFormToPills((team1IsHome ? h2hData.team1 : h2hData.team2).overall_form, 5) : [];
  const awayForm: FormPill[] = h2hData ? overallFormToPills((team1IsHome ? h2hData.team2 : h2hData.team1).overall_form, 5) : [];
  const h2hHistory: Head2HHistoricalMatch[] = h2hData && Array.isArray(h2hData.h2h) ? h2hData.h2h : [];

  // Kupa maçında takım kademe rozeti için harita (yalnızca Türkiye Kupası maçında istenir).
  const cupTiers = useTurkeyTeamTiers(isTurkishCupMatch(match)).data ?? null;

  // Maç öncesi: skor yerine başlama saati + gün. "Bugün/Yarın" saate bağlı → yalnız mount sonrası (SSR'da tarih).
  const { t: ts } = useTranslation('matchState');
  const { locale } = useI18n();
  const displayState = matchDisplayState(match);
  const kickoff = displayState.phase === 'PRE' ? kickoffInfo(match) : null;
  const now = useNow(60_000, kickoff != null);
  // Derbi rozeti (takım rakip listeleri, 24 sa cache) ve hakem istatistik kartı (yalnız açılınca çekilir).
  const derby = useIsDerby(match?.home?.id, match?.away?.id).data === true;
  const [refStatsOpen, setRefStatsOpen] = useState(false);

  if (loading) {
    return <MatchCardSkeleton />;
  }

  if (!match) {
    return <div className={styles.matchCard}>{t('noMatchInfo')}</div>;
  }

  const compName = leagueNameById(match.competition?.id, match.competition?.name, tl, 'full');
  const compLogo = match.competition?.logo;
  const country = match.country;
  const countryName = country?.name ? countryDisplayName(country, locale) : '';
  // Lig logosu yoksa Sportmonks ülke bayrağı (`league.country.image_path`); o da yoksa görsel yok.
  const countryFlag = compLogo ? null : country?.flag || null;
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
  // Tarih her zaman çizilir; "Bugün/Yarın" üstüne biner (tarih görünmez kalır) → kutunun genişliği SSR ile aynı.
  const kickoffDateText = showKickoff ? formatFixtureDate(kickoff.dayIso, locale) : '';
  const kickoffRelativeText = relativeDay ? ts(`day.${relativeDay}`) : null;
  // Başlamamış maçta tarih saatin altında; diğerlerinde (canlı / bitmiş / ertelenmiş) skorun altında küçük satır.
  // Ertelendi / iptal / tarih belirsiz: eski tarih soluk ve üstü çizili (geçerli gibi görünmesin).
  const dayInfo = showKickoff ? null : kickoffInfo(match);
  // Kısa biçim (gg.aa.yyyy · ss:dd): uzun gün adı dar skor sütununu genişletip mobilde takım adlarını sıkıştırıyordu.
  const matchDayText = dayInfo ? `${formatTrDate(dayInfo.dayIso)} · ${dayInfo.time}` : '';
  // Ertelendi / iptal / tarih belirsiz: eski tarih geçerli gibi görünmesin → soluk, üstü çizili (durum skor yerinde).
  const headerDateState = special === 'postponed' || special === 'cancelled' || special === 'tba' ? special : null;
  // Hakem yoksa: başlamamış maçta "Açıklanmadı", diğerlerinde hücre yok.
  const refereeText = refereeName || (isPre && !special ? ts('refereeTba') : '');
  const refereeStatsAvailable = Boolean(refereeName && match.referee_id && match.season_id);
  const refStatsId = `referee-stats-${match.id}`;

  const showFormRow = homeForm.length > 0 || awayForm.length > 0;
  const showH2hTable = h2hHistory.length > 0;

  const h2hSections = (
    <>
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

      {showH2hTable ? (
        <div className={styles.h2hTableWrap}>
          <div className={styles.h2hTableTitle}>{t('h2hHistory')}</div>
          <div className={styles.h2hTableScroll}>
            <table className={styles.h2hTable}>
              <colgroup>
                <col className={styles.h2hColDate} />
                <col className={styles.h2hColHome} />
                <col className={styles.h2hColScore} />
                <col className={styles.h2hColAway} />
                <col className={styles.h2hColHt} />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('h2hDate')}</th>
                  <th className={styles.h2hThHome}>{t('h2hHome')}</th>
                  <th>{t('h2hScore')}</th>
                  <th className={styles.h2hThAway}>{t('h2hAway')}</th>
                  <th>{t('h2hHt')}</th>
                </tr>
              </thead>
              <tbody>
                {h2hHistory.map((row) => {
                  // Kazanan kalın ve vurgulu; beraberlikte ikisi nötr. Uzatma / penaltı: skorun yanında küçük etiket.
                  const winner = h2hWinner(row.score, row.ps_score);
                  const finishKey = row.finish ? finishedLabelKey(row) : null;
                  return (
                    <tr key={row.id} className={styles.h2hTr}>
                      <td className={styles.h2hTdDate}>{formatTrDate(row.date)}</td>
                      <td className={`${styles.h2hTdHome} ${winner === 'home' ? styles.h2hWinner : ''}`.trim()}>
                        {row.home_name || '—'}
                      </td>
                      <td className={styles.h2hTdScore}>
                        <Link href={buildMatchHref({ id: Number(row.id), home_name: row.home_name, away_name: row.away_name })} className={styles.h2hScoreLink} prefetch={false}>
                          {row.score?.trim() || '—'}
                        </Link>
                        {finishKey ? <span className={styles.h2hFinishTag}>{t(finishKey)}</span> : null}
                      </td>
                      <td className={`${styles.h2hTdAway} ${winner === 'away' ? styles.h2hWinner : ''}`.trim()}>
                        {row.away_name || '—'}
                      </td>
                      <td>{compactHt(row.ht_score)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );

  // Oran sayıları gösterilmez (AdSense kumar politikası): yalnız oranlardan türetilen piyasa beklentisi (yüzde).
  const expectation = impliedProbabilities(match.odds?.pre);

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
          ) : countryFlag ? (
            <TeamLogo
              src={countryFlag}
              alt=""
              className={styles.cardHeaderFlag}
              width={22}
              height={16}
            />
          ) : null}
          <span className={styles.cardHeaderTitle}>
            {countryName ? (
              <>
                <strong className={styles.cardHeaderCountry}>{countryName}</strong>
                <span className={styles.cardHeaderSep}> - </span>
              </>
            ) : null}
            <span className={styles.cardHeaderLeague}>{compName}</span>
          </span>
          {derby ? <span className={infoStyles.derbyBadge}>{t('matchInfo.derby')}</span> : null}
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
            <CoachLink name={match.coaches?.home} id={match.coaches?.homeId} full={match.coaches?.homeFull} />
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
                <span className={styles.kickoffDay}>
                  <span className={kickoffRelativeText ? styles.kickoffDayHidden : undefined}>{kickoffDateText}</span>
                  {kickoffRelativeText ? <span>{kickoffRelativeText}</span> : null}
                </span>
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
            {matchDayText ? (
              <span className={styles.matchDay}>
                {headerDateState ? <s className={styles.headerDateOld}>{matchDayText}</s> : matchDayText}
              </span>
            ) : null}
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
            <CoachLink name={match.coaches?.away} id={match.coaches?.awayId} full={match.coaches?.awayFull} />
          </div>
        </div>

        {isSecondLeg(match) ? <TiePill match={match} /> : null}

        <MatchInfoLine
          match={match}
          phase={phase}
          location={location}
          refereeText={refereeText}
          refereeToggle={
            refereeStatsAvailable ? { open: refStatsOpen, controlsId: refStatsId, onToggle: () => setRefStatsOpen((v) => !v) } : null
          }
        />

        {expectation ? (
          <p className={styles.oddsStrip}>
            <span className={styles.oddsTitle}>{t('marketExpectation.label')}:</span>{' '}
            <span className={styles.oddsValue}>{t('marketExpectation.home', { p: expectation.home })}</span>
            <span className={styles.oddsSep} aria-hidden="true"> · </span>
            <span className={styles.oddsValue}>{t('marketExpectation.draw', { p: expectation.draw })}</span>
            <span className={styles.oddsSep} aria-hidden="true"> · </span>
            <span className={styles.oddsValue}>{t('marketExpectation.away', { p: expectation.away })}</span>
          </p>
        ) : null}
      </div>

      {refereeStatsAvailable && refStatsOpen ? (
        <RefereeStatsCard
          id={refStatsId}
          refereeId={match.referee_id!}
          refereeName={refereeName}
          seasonId={match.season_id!}
          leagueId={match.competition?.id}
        />
      ) : null}

      {h2hPending ? (
        <H2hSkeleton />
      ) : h2hReserved ? (
        <div className={styles.h2hReserved}>
          <H2hSkeleton className={styles.h2hReservedSizer} />
          <div ref={reservedRef} className={styles.h2hReservedContent}>
            {showFormRow || showH2hTable ? h2hSections : <p className={styles.h2hNone}>{ts('h2h.none')}</p>}
          </div>
          {h2hClipped ? (
            <button type="button" className={styles.h2hShowAll} onClick={() => setH2hExpanded(true)}>
              {ts('h2h.showAll')}
            </button>
          ) : null}
        </div>
      ) : (
        h2hSections
      )}
    </div>
  );
}
