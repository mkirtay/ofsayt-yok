import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback, type CSSProperties } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Match } from '../../models/liveScore';
import styles from './matchList.module.scss';

interface MatchListProps {
  groupedMatches: {
    competition_id: number;
    competition_name: string;
    matches: Match[];
  }[];
}

type FlatItem =
  | { type: 'header'; competition_id: number; competition_name: string; showGap: boolean }
  | {
      type: 'match';
      match: Match;
      isFirstInGroup: boolean;
      isLastInGroup: boolean;
    };

const HEADER_BAR_HEIGHT = 34;
const GROUP_GAP = 12;
const MATCH_ROW_HEIGHT = 28;

function buildFlatItems(
  groupedMatches: MatchListProps['groupedMatches']
): FlatItem[] {
  const items: FlatItem[] = [];
  for (const group of groupedMatches) {
    const showGap = items.length > 0;
    items.push({
      type: 'header',
      competition_id: group.competition_id,
      competition_name: group.competition_name,
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
    return (
      <div {...ariaAttributes} style={style} className={styles.virtualHeaderCell}>
        {item.showGap ? <div className={styles.virtualGroupSpacer} aria-hidden /> : null}
        <div className={styles.virtualHeaderBar} data-competition-id={item.competition_id}>
          {item.competition_name}
        </div>
      </div>
    );
  }

  const { match, isFirstInGroup, isLastInGroup } = item;
  const homeName = match.home?.name || '';
  const awayName = match.away?.name || '';
  const score = match.scores?.score || '- : -';
  const time = match.time || '';
  const status = match.status;
  const isLive = status === 'IN PLAY' || status === 'HALF TIME BREAK';
  const timeLabel = isLive ? `${time}'` : status === 'FINISHED' ? 'MS' : time;

  return (
    <div
      {...ariaAttributes}
      style={style}
      className={`${styles.virtualMatchRow} ${isFirstInGroup ? styles.virtualMatchRowFirst : ''} ${
        isLastInGroup ? styles.virtualMatchRowLast : ''
      }`}
    >
      <div className={`${styles.virtualCell} ${styles.virtualTime} ${isLive ? styles.live : ''}`}>
        {timeLabel}
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualHome}`}>{homeName}</div>
      <div className={`${styles.virtualCell} ${styles.virtualScore}`}>
        <Link href={`/matches/${match.id}`} className={styles.scoreLink}>
          {score}
        </Link>
      </div>
      <div className={`${styles.virtualCell} ${styles.virtualAway}`}>{awayName}</div>
    </div>
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
