import { useState } from 'react';
import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/standings';
import RatingBadge from '@/components/RatingBadge';
import TeamLogo from '@/components/TeamLogo';
import { formatRating } from '@/config/ratingScale';
import {
  buildTotwRows,
  formatTotwDateRange,
  type TeamOfTheWeek as TeamOfTheWeekData,
  type TotwPlayer,
} from '@/services/sportmonks/teamOfTheWeek';
import styles from './teamOfTheWeek.module.scss';

const PHOTO_PX = 40;

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

function PlayerToken({ player, best }: { player: TotwPlayer; best: boolean }) {
  const { t } = useTranslation('standings');
  const [photoFailed, setPhotoFailed] = useState(false);
  const rating = formatRating(player.rating);
  const title = [player.name, player.teamName, rating].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className={`${styles.dot} ${best ? styles.dotBest : ''}`.trim()}>
        {player.photo && !photoFailed ? (
          <TeamLogo src={player.photo} width={PHOTO_PX} className={styles.photo} onFail={() => setPhotoFailed(true)} />
        ) : (
          <span className={styles.initials} aria-hidden="true">
            {initials(player.name)}
          </span>
        )}
        {rating ? (
          <RatingBadge
            rating={player.rating}
            size="xs"
            className={styles.rating}
            ariaLabel={t('totwRatingLabel', { rating })}
          />
        ) : null}
        {player.teamLogo ? (
          <TeamLogo src={player.teamLogo} width={18} className={styles.teamLogo} title={player.teamName ?? undefined} />
        ) : null}
      </span>
      <span className={styles.name}>{player.shortName}</span>
      {player.teamShortCode ? <span className={styles.team}>{player.teamShortCode}</span> : null}
    </>
  );
  return player.playerId ? (
    <Link href={`/players/${player.playerId}`} className={styles.player} title={title} prefetch={false} data-testid="totw-player">
      {body}
    </Link>
  ) : (
    <div className={styles.player} title={title} data-testid="totw-player">
      {body}
    </div>
  );
}

/**
 * Haftanın 11'i — tek takımlık dikey saha (hücum yukarı), Sportmonks `formation_position` dizilişi. Kutu yüksekliği
 * sabit (`.pitch`), yüklenirken/yüklenince değişmez. En yüksek puanlı oyuncu altın halkalı.
 */
export default function TeamOfTheWeek({ data, leagueName }: { data: TeamOfTheWeekData; leagueName: string }) {
  const { t } = useTranslation('standings');
  const { locale } = useI18n();
  const rows = buildTotwRows(data);
  if (rows.length === 0) return null;
  const best = data.players.reduce<TotwPlayer | null>((a, p) => ((p.rating ?? 0) > (a?.rating ?? 0) ? p : a), null);
  const dates = formatTotwDateRange(data.round.startingAt, data.round.endingAt, locale === 'en' ? 'en' : 'tr');
  const roundLabel = data.round.name && /^\d+$/.test(data.round.name) ? t('totwRound', { round: data.round.name }) : data.round.name;

  return (
    <section className={styles.root} aria-labelledby="totw-title" data-testid="team-of-the-week">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 id="totw-title" className={styles.title}>
            {t('totwTitle')}
          </h2>
          <p className={styles.meta}>{[leagueName, roundLabel, dates].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={styles.formation} aria-label={t('totwFormation', { formation: data.formation })}>
          {data.formation}
        </span>
      </header>

      <div className={styles.pitch}>
        <div className={styles.markings} aria-hidden="true">
          <span className={styles.centerArc} />
          <span className={styles.box} />
          <span className={styles.smallBox} />
        </div>
        <ol className={styles.rows}>
          {rows.map((row, i) => (
            <li key={i} className={styles.row}>
              {row.map((p) => (
                <PlayerToken key={p.position} player={p} best={best?.position === p.position} />
              ))}
            </li>
          ))}
        </ol>
      </div>

      {best?.teamName && formatRating(best.rating) ? (
        <p className={styles.footer}>
          <span className={styles.star} aria-hidden="true">
            ★
          </span>{' '}
          {t('totwBest', { name: best.name, team: best.teamName, rating: formatRating(best.rating) })}
        </p>
      ) : null}
      <p className={styles.note}>{t('totwNote')}</p>
    </section>
  );
}
