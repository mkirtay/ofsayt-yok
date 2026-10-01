import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { useTranslation } from '@/lib/i18n';
import TeamTierBadge from '@/components/TeamTierBadge';
import TeamLogo from '@/components/TeamLogo';
import LazyLoad from '@/components/LazyLoad';
import { detectGoals, type GoalEvent } from '@/utils/goalDetection';
import { useTurkeyTeamTiers } from '@/hooks/useTurkeyTeamTiers';
import { isTurkishCupMatch } from '@/utils/cupTeamTier';
import type { TurkeyTeamTiersPayload } from '@/config/turkeyTiers';
import { leagueNameById } from '@/utils/leagueName';
import { Match } from '../../models/liveScore';
import type { GroupedLeagueMatches } from '../../services/liveScoreService';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { competitionLogoNeedsBackdrop, uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { utcTimeToTr } from '@/utils/dateFormat';
import { buildMatchHref } from '@/utils/matchUrl';
import { isModifiedClick } from '@/utils/matchSelection';
import styles from './matchList.module.scss';

// 06 · Gol anı: yalnız bir gol olunca yüklenir (ana sayfa ilk yüküne JS/CSS eklemez); bu kadar sonra kaldırılır.
const loadGoalMoment = () => import('./GoalMoment');
const GOAL_MOMENT_MS = 3200;
const NO_GOALS: ReadonlyMap<string, GoalEvent> = new Map();

/** Skoru okunabilen maçların id → skor haritası (gol karşılaştırması için). */
function scoresById(items: FlatItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.type !== 'match') continue;
    const raw = item.match.scores?.score || item.match.score;
    if (raw) map.set(String(item.match.id), raw);
  }
  return map;
}

export type MatchListVariant = 'default' | 'worldCup';

/** Tarih gruplu fikstür modu: başlık lig değil GÜN (bkz. `utils/fixtureDateGroups.ts`). */
export type MatchListDateGroup = {
  /** `YYYY-MM-DD` (TR günü) — React anahtarı ve sıra için */
  date: string;
  /** Başlıkta yazan hazır metin (çağıran i18n ile üretir, örn. "Bugün · 23 Eylül Salı") */
  label: string;
  matches: Match[];
};

interface MatchListProps {
  groupedMatches?: GroupedLeagueMatches[];
  /**
   * Verilirse lig grupları yerine GÜN grupları çizilir (UEFA kupası fikstürü): her gün için bir
   * tarih başlığı, altında o günün maçları. `groupedMatches` bu modda yok sayılır.
   */
  dateGroups?: MatchListDateGroup[];
  /** `worldCup`: koyu arka plan / yüksek kontrast (World Cup sayfası) */
  variant?: MatchListVariant;
  /** Bugünden farklı tarihli maçlar için kickoff hücresine kısa tarih ekler (örn. "15 Nis") */
  showDateWhenNotToday?: boolean;
  favoriteTeamIds?: Set<number>;
  onToggleFavorite?: (teamId: number) => void;
  /**
   * Split-view (masaüstü): verilirse satır tıklaması sayfa geçişi yerine bunu çağırır
   * (cmd/ctrl-tık ve orta tuş hâlâ normal link davranışı). Verilmezse — mobil dahil —
   * satır normal `<Link>` ile tam sayfa açar.
   */
  onSelectMatch?: (match: Match) => void;
  /** Satıra hover/focus/tıklamada detay verisini önceden ısıtır */
  onPrefetchMatch?: (matchId: string) => void;
  /** Split-view: verilirse takım adı/logosu tıklaması takım panelini açar (yoksa `/teams/[id]` sayfasına gider). */
  onSelectTeam?: (teamId: number) => void;
  selectedMatchId?: string | null;
  /** Dar liste (split-view'da detay paneli açıkken): İY sütunu gizlenir, sütunlar sıkışır */
  compact?: boolean;
  /**
   * Yüksekliği vh'den bağımsız, ebeveynden al (`height:100%` / flex-fill). Ebeveyn kesin bir
   * yüksekliğe sahipse (ana sayfa split-view sütunu) kullanılır; verilmezse eski `min(72vh, 900px)`.
   */
  fill?: boolean;
  /**
   * Dar görünüm (split-view yok): kutu içerik kadar uzar, `min(72vh, 900px)` yalnızca üst sınır.
   * Az maçlı günde altta boş alan kalmaz. `fill` ile birlikte verilmez.
   * `'belowSplit'`: aynı davranış yalnızca `$bp-split` altında, üstünde sabit yükseklik — karar CSS'te, JS ölçümü
   * (`useSplitView`) beklenmez → sunucuda çizilen kutu istemcidekiyle aynı yükseklikte (kayma yok).
   */
  fitContent?: boolean | 'belowSplit';
}

type FlatItem =
  | {
      type: 'dateHeader';
      date: string;
      label: string;
      count: number;
      showGap: boolean;
    }
  | {
      type: 'header';
      competition_id: number;
      competition_name: string;
      country_id?: number;
      country_name?: string;
      country_flag?: string;
      competition_logo?: string;
      showGap: boolean;
    }
  | {
      type: 'match';
      match: Match;
      isFirstInGroup: boolean;
      isLastInGroup: boolean;
    };

const HEADER_BAR_HEIGHT = 44;
const GROUP_GAP = 12;
const MATCH_ROW_HEIGHT = 40;
/** Kutunun en büyük yüksekliği (`min(72vh, 900px)`) — ölçümden önceki (SSR) ilk render bu kadar satırı çizer. */
const MAX_HOST_HEIGHT = 900;
/** İlk ekrandaki satırların logoları hemen (eager), kalanı tembel. */
const EAGER_LOGO_ROWS = 14;

function formatKickoff(match: Match): string {
  const date = match.date?.trim();
  const scheduled = match.scheduled?.trim();
  if (date && scheduled && /^\d{2}:\d{2}$/.test(scheduled)) {
    return utcTimeToTr(scheduled, date);
  }
  if (scheduled) return utcTimeToTr(scheduled);
  return '—';
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Istanbul',
});

/** "2026-04-15" -> "15 Nis" (TR saat dilimine göre; parse başarısızsa gün.ay). */
function formatShortDateTr(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isNaN(d.getTime())) {
    return SHORT_DATE_FMT.format(d).replace(/\.$/, '');
  }
  const parts = isoDate.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  return isoDate;
}

function todayIsoTr(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

function statusLabel(
  match: Match,
  t: (key: string) => string,
): { text: string; variant: 'live' | 'ht' | 'ft' | 'scheduled' } {
  const { status, time } = match;
  if (status === 'IN PLAY') {
    return { text: '', variant: 'live' };
  }
  if (status === 'HALF TIME BREAK') {
    return { text: t('halfTime'), variant: 'ht' };
  }
  if (status === 'FINISHED') {
    return { text: t('fullTime'), variant: 'ft' };
  }
  if (status === 'NOT STARTED' || status === 'SCHEDULED') {
    return { text: '', variant: 'scheduled' };
  }
  return { text: time || '', variant: 'scheduled' };
}

function normalizeHt(ht?: string): string {
  if (!ht || !ht.trim()) return '—';
  return ht.replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
}

function buildDateFlatItems(dateGroups: MatchListDateGroup[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const group of dateGroups) {
    items.push({
      type: 'dateHeader',
      date: group.date,
      label: group.label,
      count: group.matches.length,
      showGap: items.length > 0,
    });
    group.matches.forEach((match, i) => {
      items.push({
        type: 'match',
        match,
        isFirstInGroup: i === 0,
        isLastInGroup: i === group.matches.length - 1,
      });
    });
  }
  return items;
}

function buildFlatItems(groupedMatches: GroupedLeagueMatches[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const group of groupedMatches) {
    const showGap = items.length > 0;
    items.push({
      type: 'header',
      competition_id: group.competition_id,
      competition_name: group.competition_name,
      country_id: group.country_id,
      country_name: group.country_name,
      country_flag: group.country_flag,
      competition_logo: group.competition_logo,
      showGap,
    });
    const { matches } = group;
    matches.forEach((match, i) => {
      items.push({
        type: 'match',
        match,
        isFirstInGroup: i === 0,
        isLastInGroup: i === matches.length - 1,
      });
    });
  }
  return items;
}

type RowContext = {
  items: FlatItem[];
  showDateWhenNotToday: boolean;
  todayIso: string;
  favoriteTeamIds: Set<number>;
  onToggleFavorite: ((teamId: number) => void) | null;
  navigateTo: (path: string) => void;
  onSelectMatch: ((match: Match) => void) | null;
  onPrefetchMatch: ((matchId: string) => void) | null;
  onSelectTeam: ((teamId: number) => void) | null;
  selectedMatchId: string | null;
  /** Türkiye Kupası maçlarında takım kademe rozeti için (yoksa rozet yok). */
  cupTiers: TurkeyTeamTiersPayload | null;
  /** Son yenilemede skoru artan maçlar (06 · Gol anı; canlı satırda bir kez oynar). */
  goals: ReadonlyMap<string, GoalEvent>;
};

type VirtualRowProps = RowComponentProps<RowContext>;

function VirtualRow({
  index,
  style,
  items,
  showDateWhenNotToday,
  todayIso,
  favoriteTeamIds,
  onToggleFavorite,
  navigateTo,
  onSelectMatch,
  onPrefetchMatch,
  onSelectTeam,
  selectedMatchId,
  cupTiers,
  goals,
  ariaAttributes,
}: VirtualRowProps) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const item = items[index];
  if (!item) return null;

  if (item.type === 'dateHeader') {
    return (
      <div {...ariaAttributes} style={style} className={styles.virtualHeaderCell}>
        {item.showGap ? <div className={styles.virtualGroupSpacer} aria-hidden /> : null}
        <div className={`${styles.virtualHeaderBar} ${styles.virtualDateBar}`} data-fixture-date={item.date}>
          <div className={styles.virtualHeaderMain}>
            <span className={styles.virtualDateLabel}>{item.label}</span>
          </div>
          <span className={styles.virtualDateCount}>{t('list.matchCount', { count: item.count })}</span>
        </div>
      </div>
    );
  }

  if (item.type === 'header') {
    const logoUrl =
      item.competition_logo || uefaCompetitionLogoSrcById(item.competition_id);
    const showCountryFlag = !logoUrl && item.country_id != null;
    return (
      <div {...ariaAttributes} style={style} className={styles.virtualHeaderCell}>
        {item.showGap ? <div className={styles.virtualGroupSpacer} aria-hidden /> : null}
        <div className={styles.virtualHeaderBar} data-competition-id={item.competition_id}>
          <div className={styles.virtualHeaderMain}>
            {logoUrl ? (
              <TeamLogo
                src={logoUrl}
                className={`${styles.virtualHeaderLogo} ${
                  competitionLogoNeedsBackdrop(item.competition_id) ? styles.logoBackdrop : ''
                }`.trim()}
                width={22}
                priority={index < EAGER_LOGO_ROWS}
              />
            ) : showCountryFlag ? (
              <TeamLogo
                src={item.country_flag || countryFlagImgSrc(item.country_id!)}
                className={styles.virtualHeaderFlag}
                width={22}
                height={16}
                priority={index < EAGER_LOGO_ROWS}
              />
            ) : null}
            <span className={styles.virtualHeaderTitleBlock}>
              {item.country_name ? (
                <>
                  <strong className={styles.virtualHeaderSep}>{item.country_name}</strong>
                  <span className={styles.virtualHeaderSep}> - </span>
                </>
              ) : null}
              <span className={styles.virtualHeaderLeagueName}>
                {leagueNameById(item.competition_id, item.competition_name, tl)}
              </span>
            </span>
          </div>
          <span className={styles.virtualHeaderColIy}>{t('halfTime')}</span>
        </div>
      </div>
    );
  }

  const { match, isFirstInGroup, isLastInGroup } = item;
  const homeName = match.home?.name || '';
  const awayName = match.away?.name || '';
  const homeLogo = match.home?.logo;
  const awayLogo = match.away?.logo;
  const kickoffUtc = formatKickoff(match);
  const matchDate = match.date?.trim();
  const showShortDate =
    showDateWhenNotToday && !!matchDate && matchDate !== todayIso;
  const shortDate = showShortDate ? formatShortDateTr(matchDate!) : '';
  const { text: statusText, variant } = statusLabel(match, t);
  const scoreRaw = match.scores?.score || match.score;
  const score =
    variant === 'scheduled' && !scoreRaw?.trim() ? '—' : scoreRaw?.trim() || '- : -';
  const isLive = variant === 'live';
  const liveMinute = isLive ? (match.time || '').replace(/'$/u, '').trim() : '';
  const htDisplay = normalizeHt(match.scores?.ht_score);

  const rowClass = [
    styles.virtualMatchRow,
    isFirstInGroup ? styles.virtualMatchRowFirst : '',
    isLastInGroup ? styles.virtualMatchRowLast : '',
    isLive ? styles.virtualMatchRowLive : '',
    variant === 'ht' ? styles.virtualMatchRowHalfTime : '',
    selectedMatchId != null && String(match.id) === selectedMatchId ? styles.virtualMatchRowSelected : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isFav =
    favoriteTeamIds.has(match.home?.id ?? -1) || favoriteTeamIds.has(match.away?.id ?? -1);
  const goal = isLive ? goals.get(String(match.id)) : undefined;

  return (
    <div {...ariaAttributes} style={style} className={rowClass}>
      <Link
        href={buildMatchHref(match)}
        className={styles.matchRowLink}
        prefetch={false}
        aria-current={selectedMatchId != null && String(match.id) === selectedMatchId ? 'true' : undefined}
        onMouseEnter={onPrefetchMatch ? () => onPrefetchMatch(String(match.id)) : undefined}
        onFocus={onPrefetchMatch ? () => onPrefetchMatch(String(match.id)) : undefined}
        onClick={
          onSelectMatch
            ? (e) => {
                if (isModifiedClick(e)) return;
                e.preventDefault();
                onPrefetchMatch?.(String(match.id));
                onSelectMatch(match);
              }
            : undefined
        }
      >
        <div className={`${styles.virtualCell} ${styles.virtualKickoff}`}>
          {showShortDate ? (
            <span className={styles.kickoffStack}>
              <span className={styles.kickoffDate}>{shortDate}</span>
              <span className={styles.kickoffTime}>{kickoffUtc}</span>
            </span>
          ) : (
            kickoffUtc
          )}
        </div>
        <div
          className={`${styles.virtualCell} ${styles.virtualStatus} ${
            isLive ? styles.virtualStatusLive : ''
          } ${variant === 'ht' ? styles.virtualStatusHt : ''} ${variant === 'ft' ? styles.virtualStatusFt : ''}`}
        >
          {isLive ? (
            <span className={styles.liveText}>
              <span className={styles.liveCanliWord}>{t('list.live')} </span>
              {`${liveMinute}'`}
            </span>
          ) : (
            statusText
          )}
        </div>
        <div
          className={`${styles.virtualCell} ${styles.virtualHome}${match.home?.id ? ` ${styles.virtualTeamCell}` : ''}`}
          onClick={match.home?.id ? (e) => { e.stopPropagation(); e.preventDefault(); if (onSelectTeam) onSelectTeam(match.home!.id); else navigateTo(`/teams/${match.home!.id}`); } : undefined}
        >
          <TeamLogo src={homeLogo} className={styles.teamCrest} width={18} priority={index < EAGER_LOGO_ROWS} />
          <span className={`${styles.teamName}${match.home?.id ? ` ${styles.teamNameLink}` : ''}`}>{homeName}</span>
          <TeamTierBadge match={match} teamId={match.home?.id} tiers={cupTiers} />
        </div>
        <div className={`${styles.virtualCell} ${styles.virtualScore}`} data-goal-anchor>
          <span className={styles.scoreText}>{score}</span>
        </div>
        <div
          className={`${styles.virtualCell} ${styles.virtualAway}${match.away?.id ? ` ${styles.virtualTeamCell}` : ''}`}
          onClick={match.away?.id ? (e) => { e.stopPropagation(); e.preventDefault(); if (onSelectTeam) onSelectTeam(match.away!.id); else navigateTo(`/teams/${match.away!.id}`); } : undefined}
        >
          <TeamLogo src={awayLogo} className={styles.teamCrest} width={18} priority={index < EAGER_LOGO_ROWS} />
          <span className={`${styles.teamName}${match.away?.id ? ` ${styles.teamNameLink}` : ''}`}>{awayName}</span>
          <TeamTierBadge match={match} teamId={match.away?.id} tiers={cupTiers} />
        </div>
        <div className={`${styles.virtualCell} ${styles.virtualHt}`}>{htDisplay}</div>
      </Link>
      {onToggleFavorite !== null && (
        <button
          type="button"
          className={`${styles.virtualMatchStar} ${isFav ? styles.virtualMatchStarActive : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(match.home?.id ?? 0);
          }}
          aria-label={isFav ? t('list.removeFavorite') : t('list.addFavorite')}
        >
          {isFav ? '★' : '☆'}
        </button>
      )}
      {goal ? <LazyLoad key={goal.key} load={loadGoalMoment} props={{ side: goal.side }} /> : null}
    </div>
  );
}

const LIST_STYLE: CSSProperties = { height: '100%', width: '100%' };

function rowHeight(index: number, rowProps: RowContext): number {
  const item = rowProps.items[index];
  if (!item) return MATCH_ROW_HEIGHT;
  if (item.type === 'header' || item.type === 'dateHeader') {
    return HEADER_BAR_HEIGHT + (item.showGap ? GROUP_GAP : 0);
  }
  return MATCH_ROW_HEIGHT;
}

export default function MatchList({
  groupedMatches = [],
  dateGroups,
  variant = 'default',
  showDateWhenNotToday = false,
  favoriteTeamIds,
  onToggleFavorite,
  onSelectMatch,
  onPrefetchMatch,
  onSelectTeam,
  selectedMatchId,
  compact = false,
  fill = false,
  fitContent = false,
}: MatchListProps) {
  const { t } = useTranslation('match');
  const router = useRouter();
  const navigateTo = useCallback((path: string) => { void router.push(path); }, [router]);
  const isWorldCup = variant === 'worldCup';

  const items = useMemo(
    () => (dateGroups ? buildDateFlatItems(dateGroups) : buildFlatItems(groupedMatches)),
    [dateGroups, groupedMatches],
  );

  const todayIso = useMemo(() => todayIsoTr(), []);

  // Yalnızca listede Türkiye Kupası maçı varsa (Sportmonks) takım→kademe haritası çekilir.
  const hasCupMatch = useMemo(() => items.some((i) => i.type === 'match' && isTurkishCupMatch(i.match)), [items]);
  const cupTiers = useTurkeyTeamTiers(hasCupMatch).data ?? null;

  // 06 · Gol anı: iki yenileme arasında skoru artan maçlar. İlk çizimde karşılaştırılacak önceki skor yok → oynamaz.
  // (Önceki render'ın bilgisini saklama kalıbı: liste değişince render sırasında karşılaştırılır.)
  const [scoreTrack, setScoreTrack] = useState<{ items: FlatItem[]; scores: Map<string, string> } | null>(null);
  const [goals, setGoals] = useState<ReadonlyMap<string, GoalEvent>>(NO_GOALS);
  if (scoreTrack?.items !== items) {
    const scores = scoresById(items);
    if (scoreTrack) {
      const fresh = detectGoals(scoreTrack.scores, scores);
      if (fresh.size > 0) setGoals(new Map([...goals, ...fresh]));
    }
    setScoreTrack({ items, scores });
  }
  useEffect(() => {
    if (goals.size === 0) return;
    const id = window.setTimeout(() => setGoals(NO_GOALS), GOAL_MOMENT_MS);
    return () => window.clearTimeout(id);
  }, [goals]);

  const rowProps = useMemo<RowContext>(
    () => ({
      items,
      showDateWhenNotToday,
      todayIso,
      favoriteTeamIds: favoriteTeamIds ?? new Set<number>(),
      onToggleFavorite: onToggleFavorite ?? null,
      navigateTo,
      onSelectMatch: onSelectMatch ?? null,
      onPrefetchMatch: onPrefetchMatch ?? null,
      onSelectTeam: onSelectTeam ?? null,
      selectedMatchId: selectedMatchId ?? null,
      cupTiers,
      goals,
    }),
    [
      items,
      showDateWhenNotToday,
      todayIso,
      favoriteTeamIds,
      onToggleFavorite,
      navigateTo,
      onSelectMatch,
      onPrefetchMatch,
      onSelectTeam,
      selectedMatchId,
      cupTiers,
      goals,
    ]
  );

  const contentHeight = useMemo(
    () => items.reduce((sum, _item, index) => sum + rowHeight(index, rowProps), 0),
    [items, rowProps],
  );

  const fit = Boolean(fitContent) && !fill;
  const hostClassName = [
    styles.virtualHost,
    fill ? styles.virtualHostFill : '',
    fit ? styles.virtualHostFit : '',
    fit && fitContent === 'belowSplit' ? styles.virtualHostFitBelowSplit : '',
    isWorldCup ? styles.worldCup : '',
    compact ? styles.virtualHostCompact : '',
  ]
    .filter(Boolean)
    .join(' ');
  // Yükseklik CSS değişkeniyle: `belowSplit` modunda geniş ekranda CSS bunu yok sayabilsin (inline height ezilemezdi).
  const hostStyle = fit ? ({ '--list-content-h': `${contentHeight}px` } as CSSProperties) : undefined;

  if (items.length === 0) {
    return (
      <div className={`${styles.empty} ${isWorldCup ? styles.worldCup : ''}`.trim()}>
        {t('list.empty')}
      </div>
    );
  }

  // Sunucuda da çizilir: List ölçüm yapana kadar `defaultHeight` kadar satır verir (SSR = istemcinin ilk render'ı),
  // sonra kutunun gerçek yüksekliğini ölçüp görünür aralığı günceller — satır konumları değişmez, kayma yok.
  return (
    <div className={hostClassName} style={hostStyle}>
      <List
        className={styles.virtualList}
        rowCount={items.length}
        rowHeight={rowHeight}
        rowProps={rowProps}
        rowComponent={VirtualRow}
        overscanCount={10}
        defaultHeight={Math.min(contentHeight, MAX_HOST_HEIGHT)}
        style={LIST_STYLE}
      />
    </div>
  );
}
