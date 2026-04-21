import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback, type CSSProperties } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Match } from '../../models/liveScore';
import type { GroupedLeagueMatches } from '../../services/liveScoreService';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { utcTimeToTr } from '@/utils/dateFormat';
import styles from './matchList.module.scss';

export type MatchListVariant = 'default' | 'worldCup';

interface MatchListProps {
  groupedMatches: GroupedLeagueMatches[];
  /** `worldCup`: koyu arka plan / yüksek kontrast (World Cup sayfası) */
  variant?: MatchListVariant;
  /** Bugünden farklı tarihli maçlar için kickoff hücresine kısa tarih ekler (örn. "15 Nis") */
  showDateWhenNotToday?: boolean;
}

type FlatItem =
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

function statusLabel(match: Match): { text: string; variant: 'live' | 'ht' | 'ft' | 'scheduled' } {
  const { status, time } = match;
  if (status === 'IN PLAY') {
    return { text: '', variant: 'live' };
  }
  if (status === 'HALF TIME BREAK') {
    return { text: 'İY', variant: 'ht' };
  }
  if (status === 'FINISHED') {
    return { text: 'MS', variant: 'ft' };
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

function buildFlatItems(groupedMatches: MatchListProps['groupedMatches']): FlatItem[] {
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
};

type VirtualRowProps = RowComponentProps<RowContext>;

function VirtualRow({
  index,
  style,
  items,
  showDateWhenNotToday,
  todayIso,
  ariaAttributes,
}: VirtualRowProps) {
  const item = items[index];
  if (!item) return null;

  if (item.type === 'header') {
    const logoUrl = item.competition_logo;
    const showCountryFlag = !logoUrl && item.country_id != null;
    return (
      <div {...ariaAttributes} style={style} className={styles.virtualHeaderCell}>
        {item.showGap ? <div className={styles.virtualGroupSpacer} aria-hidden /> : null}
        <div className={styles.virtualHeaderBar} data-competition-id={item.competition_id}>
          <div className={styles.virtualHeaderMain}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className={styles.virtualHeaderLogo} width={22} height={22} />
            ) : showCountryFlag ? (
              <img
                src={countryFlagImgSrc(item.country_id!)}
                alt=""
                className={styles.virtualHeaderFlag}
                width={22}
                height={16}
              />
            ) : null}
            <span className={styles.virtualHeaderTitleBlock}>
              {item.country_name ? (
                <>
                  <strong className={styles.virtualHeaderSep}>{item.country_name}</strong>
                  <span className={styles.virtualHeaderSep}> - </span>
                </>
              ) : null}
              <span className={styles.virtualHeaderLeagueName}>{item.competition_name}</span>
            </span>
          </div>
          <span className={styles.virtualHeaderColIy}>İY</span>
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
  const { text: statusText, variant } = statusLabel(match);
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
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Link
      {...ariaAttributes}
      href={`/matches/${match.id}`}
      style={style}
      className={rowClass}
      prefetch={false}
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
          <span className={styles.liveCanliWord}>CANLI </span>
          {`${liveMinute}'`}
        </span>
        ) : (
          statusText
        )}
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualHome}`}>
        {homeLogo ? (
          <img
            src={homeLogo}
            alt=""
            className={styles.teamCrest}
            width={18}
            height={18}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <span className={styles.teamName}>{homeName}</span>
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualScore}`}>
        <span className={styles.scoreText}>{score}</span>
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualAway}`}>
        {awayLogo ? (
          <img
            src={awayLogo}
            alt=""
            className={styles.teamCrest}
            width={18}
            height={18}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <span className={styles.teamName}>{awayName}</span>
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualHt}`}>{htDisplay}</div>
    </Link>
  );
}

function rowHeight(index: number, rowProps: RowContext): number {
  const item = rowProps.items[index];
  if (!item) return MATCH_ROW_HEIGHT;
  if (item.type === 'header') {
    return HEADER_BAR_HEIGHT + (item.showGap ? GROUP_GAP : 0);
  }
  return MATCH_ROW_HEIGHT;
}

export default function MatchList({
  groupedMatches,
  variant = 'default',
  showDateWhenNotToday = false,
}: MatchListProps) {
  const [mounted, setMounted] = useState(false);
  const isWorldCup = variant === 'worldCup';
  useEffect(() => {
    setMounted(true);
  }, []);

  const items = useMemo(() => buildFlatItems(groupedMatches), [groupedMatches]);

  const todayIso = useMemo(() => todayIsoTr(), []);

  const rowProps = useMemo<RowContext>(
    () => ({ items, showDateWhenNotToday, todayIso }),
    [items, showDateWhenNotToday, todayIso]
  );

  const listStyle = useCallback(
    (height: number, width: number): CSSProperties => ({
      height,
      width,
    }),
    []
  );

  if (groupedMatches.length === 0) {
    return (
      <div className={`${styles.empty} ${isWorldCup ? styles.worldCup : ''}`.trim()}>
        Şu an gösterilecek maç bulunmuyor.
      </div>
    );
  }

  if (!mounted) {
    return (
      <div
        className={`${styles.virtualHost} ${isWorldCup ? styles.worldCup : ''}`.trim()}
        aria-busy="true"
      >
        <div className={styles.virtualPlaceholder}>Yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className={`${styles.virtualHost} ${isWorldCup ? styles.worldCup : ''}`.trim()}>
      <AutoSizer
        renderProp={({ height, width }) => {
          if (height === undefined || width === undefined) {
            return null;
          }
          return (
            <List
              className={styles.virtualList}
              rowCount={items.length}
              rowHeight={rowHeight}
              rowProps={rowProps}
              rowComponent={VirtualRow}
              overscanCount={10}
              style={listStyle(700, width)}
            />
          );
        }}
      />
    </div>
  );
}
