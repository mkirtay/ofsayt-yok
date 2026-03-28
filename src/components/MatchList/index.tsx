import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback, type CSSProperties } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Match } from '../../models/liveScore';
import type { GroupedLeagueMatches } from '../../services/liveScoreService';
import { FLAG_PROXY_PATH, countryFlagImgSrc } from '@/utils/countryFlag';
import styles from './matchList.module.scss';

interface MatchListProps {
  groupedMatches: GroupedLeagueMatches[];
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

/** Tarih + planlanan saat varsa UTC olarak gösterir; aksi halde planlanan saati veya em tire. */
function formatKickoffUtc(match: Match): string {
  const date = match.date?.trim();
  const scheduled = match.scheduled?.trim();
  if (date && scheduled && /^\d{2}:\d{2}$/.test(scheduled)) {
    const parsed = new Date(`${date}T${scheduled}:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return (
        parsed.toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        }) + ' UTC'
      );
    }
  }
  if (scheduled) return `${scheduled}`;
  return '—';
}

function statusLabel(match: Match): { text: string; variant: 'live' | 'ht' | 'ft' | 'scheduled' } {
  const { status, time } = match;
  if (status === 'IN PLAY') {
    const minute = (time || '').replace(/'$/u, '').trim();
    return { text: `🔴 CANLI ${minute}'`, variant: 'live' };
  }
  if (status === 'HALF TIME BREAK') {
    return { text: 'İY', variant: 'ht' };
  }
  if (status === 'FINISHED') {
    return { text: 'MS', variant: 'ft' };
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

type VirtualRowProps = RowComponentProps<{ items: FlatItem[] }>;

function VirtualRow({ index, style, items, ariaAttributes }: VirtualRowProps) {
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
                  <strong className={styles.virtualHeaderCountry}>{item.country_name}</strong>
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
  const score = match.scores?.score || match.score || '- : -';
  const kickoffUtc = formatKickoffUtc(match);
  const { text: statusText, variant } = statusLabel(match);
  const isLive = variant === 'live';
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
      <div className={`${styles.virtualCell} ${styles.virtualKickoff}`}>{kickoffUtc}</div>
      <div
        className={`${styles.virtualCell} ${styles.virtualStatus} ${
          isLive ? styles.virtualStatusLive : ''
        } ${variant === 'ht' ? styles.virtualStatusHt : ''} ${variant === 'ft' ? styles.virtualStatusFt : ''}`}
      >
        {isLive ? <span className={styles.liveBadge}>{statusText}</span> : statusText}
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualHome}`}>
        {homeLogo ? (
          <img
            src={homeLogo}
            alt=""
            className={styles.teamCrest}
            width={20}
            height={20}
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
            width={20}
            height={20}
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

function rowHeight(index: number, rowProps: { items: FlatItem[] }): number {
  const item = rowProps.items[index];
  if (!item) return MATCH_ROW_HEIGHT;
  if (item.type === 'header') {
    return HEADER_BAR_HEIGHT + (item.showGap ? GROUP_GAP : 0);
  }
  return MATCH_ROW_HEIGHT;
}

export default function MatchList({ groupedMatches }: MatchListProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    console.log('[MatchList] Gruplanmış maç verisi', groupedMatches);
    const sample = groupedMatches[0]?.matches[0];
    console.log('[MatchList] Örnek maç (ham)', sample);
    console.log(
      '[MatchList] Ülke bayrağı: `country.flag` (örn. BIH.png) yalnızca dosya adı, doğrudan CDN path’i değil. Görüntü için `country_id` ile:',
      `${FLAG_PROXY_PATH}?country_id=<id> → upstream countries/flag.json?country_id=... (PNG). Örnek ham alan:`,
      sample?.country
    );
  }, [groupedMatches]);

  const items = useMemo(() => buildFlatItems(groupedMatches), [groupedMatches]);

  const rowProps = useMemo(() => ({ items }), [items]);

  const listStyle = useCallback(
    (height: number, width: number): CSSProperties => ({
      height,
      width,
    }),
    []
  );

  if (groupedMatches.length === 0) {
    return <div className={styles.empty}>Şu an gösterilecek maç bulunmuyor.</div>;
  }

  if (!mounted) {
    return (
      <div className={styles.virtualHost} aria-busy="true">
        <div className={styles.virtualPlaceholder}>Yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className={styles.virtualHost}>
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
              style={listStyle(height, width)}
            />
          );
        }}
      />
    </div>
  );
}
