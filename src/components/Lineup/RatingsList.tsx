import { useState } from 'react';
import Link from 'next/link';
import type { LineupPlayer } from '@/models/domain';
import type { PlayerMatchEvents } from '@/utils/lineupPlayerEvents';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import { formatRating } from '@/config/ratingScale';
import RatingBadge from '@/components/RatingBadge';
import TeamLogo from '@/components/TeamLogo';
import styles from './lineup.module.scss';

export type RatingSide = 'home' | 'away';
export type RatedPlayer = { player: LineupPlayer; side: RatingSide; rating: number };
export type RatingSort = 'desc' | 'asc';
export type RatingFilter = 'all' | RatingSide;

/**
 * Reytingi olan oyuncular (ilk 11 + oyuna giren yedekler; oynamayan yedekte reyting yok). Geçersiz / ≤0 reyting listeye
 * girmez (rozet kuralıyla aynı: `formatRating` null → yok). Eşitlikte ad sırası (kararlı liste).
 */
export function rankPlayers(home: LineupPlayer[], away: LineupPlayer[], sort: RatingSort, filter: RatingFilter): RatedPlayer[] {
  const rows: RatedPlayer[] = [];
  const add = (list: LineupPlayer[], side: RatingSide) => {
    if (filter !== 'all' && filter !== side) return;
    for (const p of list) if (formatRating(p.rating) != null) rows.push({ player: p, side, rating: p.rating as number });
  };
  add(home, 'home');
  add(away, 'away');
  const dir = sort === 'desc' ? -1 : 1;
  return rows.sort((a, b) => (a.rating - b.rating) * dir || a.player.name.localeCompare(b.player.name, 'tr'));
}

type Team = { name: string; logo?: string | null };

/**
 * "Reytingler" görünümü: iki takımın oyuncuları tek listede, reytinge göre sıralı (yüksek→düşük / düşük→yüksek), takım
 * süzgeci. Satır oyuncu sayfasına gider. Sıralama ve süzgeç yalnız istemci durumu (URL'ye yazılmaz).
 */
export default function RatingsList({
  homePlayers,
  awayPlayers,
  home,
  away,
  eventsById,
}: {
  homePlayers: LineupPlayer[];
  awayPlayers: LineupPlayer[];
  home: Team;
  away: Team;
  eventsById: Map<string, PlayerMatchEvents>;
}) {
  const { t } = useTranslation('matchState');
  const [sort, setSort] = useState<RatingSort>('desc');
  const [filter, setFilter] = useState<RatingFilter>('all');
  const rows = rankPlayers(homePlayers, awayPlayers, sort, filter);
  const team = (side: RatingSide) => (side === 'home' ? home : away);

  return (
    <div className={styles.ratings} data-testid="lineup-ratings">
      <div className={styles.ratingsBar}>
        <div className={styles.ratingsFilter} role="group" aria-label={t('lineup.ratings.filterLabel')}>
          {(['all', 'home', 'away'] as const).map((f) => (
            <button key={f} type="button" className={styles.ratingsChip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? t('lineup.ratings.all') : team(f).name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.ratingsSort}
          onClick={() => setSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
          aria-label={t(sort === 'desc' ? 'lineup.ratings.sortDescAria' : 'lineup.ratings.sortAscAria')}
        >
          <span aria-hidden="true">{sort === 'desc' ? '↓' : '↑'}</span>
          {t(sort === 'desc' ? 'lineup.ratings.sortDesc' : 'lineup.ratings.sortAsc')}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>{t('lineup.ratings.none')}</p>
      ) : (
        <ol className={styles.ratingsList}>
          {rows.map(({ player, side }, i) => {
            const ev = eventsById.get(player.id);
            const minutes = ev?.subIn != null ? t('lineup.ratings.subIn', { minute: ev.subIn }) : ev?.subOut != null ? t('lineup.ratings.subOut', { minute: ev.subOut }) : null;
            const tm = team(side);
            const body = (
              <>
                <span className={styles.ratingsRank}>{i + 1}</span>
                <RatingsPhoto src={player.photo} />
                <span className={styles.compactText}>
                  <span className={styles.compactName}>
                    {player.name}
                    {player.captain ? <span className={styles.ratingsCaptain}> (C)</span> : null}
                  </span>
                  <span className={styles.compactMeta}>
                    {tm.logo ? <TeamLogo src={tm.logo} className={styles.ratingsTeamLogo} width={14} height={14} /> : null}
                    <span className={styles.compactPos}>
                      {[tm.name, player.pos_code, minutes].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </span>
                <RatingBadge rating={player.rating} size="sm" data-testid="ratings-row-rating" />
              </>
            );
            return (
              <li key={`${side}-${player.id}`}>
                {player.id ? (
                  <Link href={`/players/${player.id}`} prefetch={false} className={styles.ratingsRow} data-side={side}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.ratingsRow} data-side={side}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RatingsPhoto({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <TeamLogo src={src} className={styles.compactPhoto} width={28} height={28} onFail={() => setFailed(true)} />
  ) : (
    <span className={`${styles.compactPhoto} ${styles.compactPhotoEmpty}`} aria-hidden="true" />
  );
}
