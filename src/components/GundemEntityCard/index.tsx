import Link from 'next/link';
import RatingBadge from '@/components/RatingBadge';
import TeamLogo from '@/components/TeamLogo';
import { useHubMatchFromCache } from '@/hooks/useHubMatchFromCache';
import { useI18n, useTranslation } from '@/lib/i18n';
import type { Match } from '@/models/liveScore';
import type { GundemEntityCard as Card, GundemMatchCard, GundemPlayerCard, GundemTeamCard } from '@/types/gundem';
import { buildMatchHref } from '@/utils/matchUrl';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { liveMinuteLabel } from '@/utils/liveMinute';
import { parseScore } from '@/utils/parseScore';
import styles from './gundemEntityCard.module.scss';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function entityCardHref(card: Card): string {
  if (card.type === 'PLAYER') return `/players/${card.id}`;
  if (card.type === 'TEAM') return `/teams/${card.id}`;
  return buildMatchHref({ id: card.id, home: { name: card.home.name }, away: { name: card.away.name } });
}

/**
 * Ana sayfanın canlı listesindeki (varsa) güncel hâli karta uygular: durum, dakika, skor. Liste daha geride olabilir
 * (sunucu kartı yeni bitmiş maçı görmüşken liste hâlâ canlı) → yalnız ileri giden evre yazılır.
 */
export function overlayLiveMatch(card: GundemMatchCard, live: Match | null): GundemMatchCard {
  if (!live) return card;
  const order = { PRE: 0, LIVE: 1, HT: 1, POST: 2 } as const;
  if (order[deriveMatchPhase(live.status)] < order[deriveMatchPhase(card.status)]) return card;
  const phase = deriveMatchPhase(live.status);
  return {
    ...card,
    status: live.status,
    stateCode: live.state_code ?? card.stateCode,
    minute: phase === 'LIVE' || phase === 'HT' ? (live.time ? String(live.time) : null) : null,
    score: phase === 'PRE' ? null : (parseScore(live.scores?.score ?? live.score) ?? card.score),
  };
}

const SPECIAL = new Set(['POSTPONED', 'CANCELLED', 'DELETED', 'ABANDONED', 'TBA', 'DELAYED', 'SUSPENDED', 'INTERRUPTED', 'AWARDED', 'WALKOVER']);

/** Durum etiketi + tonu: Canlı 67' / Devre arası / Bitti / Ertelendi / "21:00" (bugün) / "9 Kas 21:00". */
export function matchStatusLabel(card: GundemMatchCard, t: TFn, locale: string, now: number = Date.now()): { text: string; tone: 'live' | 'done' | 'upcoming' } {
  if (card.stateCode && SPECIAL.has(card.stateCode)) return { text: t(`entity.special.${card.stateCode}`), tone: 'done' };
  const phase = deriveMatchPhase(card.status);
  if (phase === 'LIVE') {
    const min = liveMinuteLabel(card.minute);
    return { text: min ? t('entity.liveMinute', { minute: min }) : t('entity.live'), tone: 'live' };
  }
  if (phase === 'HT') return { text: t('entity.halfTime'), tone: 'live' };
  if (phase === 'POST') return { text: t('entity.finished'), tone: 'done' };
  if (!card.startingAt) return { text: t('entity.upcoming'), tone: 'upcoming' };
  const d = new Date(card.startingAt);
  const lang = locale === 'en' ? 'en-GB' : 'tr-TR';
  const opts = { timeZone: 'Europe/Istanbul' } as const;
  const time = d.toLocaleTimeString(lang, { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = (x: Date) => x.toLocaleDateString('en-CA', opts);
  if (sameDay(d) === sameDay(new Date(now))) return { text: time, tone: 'upcoming' };
  return { text: `${d.toLocaleDateString(lang, { ...opts, day: 'numeric', month: 'short' })} ${time}`, tone: 'upcoming' };
}

function PlayerBody({ card, t }: { card: GundemPlayerCard; t: TFn }) {
  return (
    <>
      <TeamLogo src={card.photo} width={40} className={styles.photo} alt="" fallback={<span className={styles.photoPh} aria-hidden="true" />} />
      <span className={styles.main}>
        <span className={styles.title}>{card.name}</span>
        {card.team ? (
          <span className={styles.sub}>
            <TeamLogo src={card.team.logo} width={14} className={styles.subLogo} alt="" />
            <span className={styles.ellipsis}>{card.team.name}</span>
          </span>
        ) : null}
      </span>
      <span className={styles.side}>
        {card.season ? (
          <span className={styles.stats} title={card.season.name}>
            <span className={styles.stat}>
              <b>{card.season.goals}</b> {t('entity.goalsShort')}
            </span>
            <span className={styles.stat}>
              <b>{card.season.assists}</b> {t('entity.assistsShort')}
            </span>
          </span>
        ) : null}
        <RatingBadge rating={card.lastRating} size="sm" ariaLabel={card.lastRating != null ? t('entity.lastRating', { rating: card.lastRating.toFixed(1) }) : undefined} />
      </span>
    </>
  );
}

function TeamBody({ card, t }: { card: GundemTeamCard; t: TFn }) {
  return (
    <>
      <TeamLogo src={card.logo} width={36} className={styles.teamLogo} alt="" fallback={<span className={styles.photoPh} aria-hidden="true" />} />
      <span className={styles.main}>
        <span className={styles.title}>{card.name}</span>
        {card.standing ? (
          <span className={styles.sub}>
            <TeamLogo src={card.standing.leagueLogo} width={14} className={styles.subLogo} alt="" />
            <span className={styles.ellipsis}>{card.standing.leagueName}</span>
          </span>
        ) : null}
      </span>
      {card.standing ? (
        <span className={styles.side}>
          <span className={styles.rank} title={t('entity.rankTitle', { rank: card.standing.rank, points: card.standing.points })}>
            {t('entity.rank', { rank: card.standing.rank })}
          </span>
          <span className={styles.points}>{t('entity.points', { points: card.standing.points })}</span>
        </span>
      ) : null}
    </>
  );
}

function MatchBody({ card, t }: { card: GundemMatchCard; t: TFn }) {
  const { locale } = useI18n();
  const live = useHubMatchFromCache(card.id);
  const m = overlayLiveMatch(card, live);
  const status = matchStatusLabel(m, t, locale);
  const row = (team: GundemMatchCard['home'], goals: number | undefined, win: boolean) => (
    <span className={`${styles.teamRow} ${win ? styles.winner : ''}`.trim()}>
      <TeamLogo src={team.logo} width={18} className={styles.rowLogo} alt="" />
      <span className={styles.ellipsis}>{team.name}</span>
      {goals != null ? <span className={styles.goals}>{goals}</span> : null}
    </span>
  );
  const [h, a] = m.score ?? [];
  const done = deriveMatchPhase(m.status) === 'POST';
  return (
    <span className={styles.matchWrap}>
      <span className={styles.matchHead}>
        {m.league ? (
          <span className={styles.league}>
            <TeamLogo src={m.league.logo} width={14} className={styles.subLogo} alt="" />
            <span className={styles.ellipsis}>{m.league.name}</span>
          </span>
        ) : (
          <span />
        )}
        <span className={`${styles.status} ${styles[status.tone]}`} data-tone={status.tone}>
          {status.text}
        </span>
      </span>
      {row(m.home, h, done && h != null && a != null && h > a)}
      {row(m.away, a, done && h != null && a != null && a > h)}
      <span className={styles.go}>
        {t('entity.goToMatch')} <span aria-hidden="true">→</span>
      </span>
    </span>
  );
}

/**
 * Gönderi metninin altındaki kompakt varlık kartı (oyuncu / takım / maç) — tamamı ilgili sayfaya bağlantı.
 * Maç kartı, ana sayfanın canlı listesi önbellekteyse skoru oradan günceller (ek istek yok).
 */
export default function GundemEntityCard({ card }: { card: Card }) {
  const { t } = useTranslation('gundem');
  return (
    <Link href={entityCardHref(card)} className={`${styles.card} ${styles[card.type.toLowerCase()]}`} data-entity={card.type}>
      {/* Ekran okuyucuya kart türü ("Oyuncu:"); içerik (ad, takım, istatistik) bağlantı metni olarak okunur. */}
      <span className={styles.srOnly}>{t(`entity.kind.${card.type}`)}: </span>
      {card.type === 'PLAYER' ? <PlayerBody card={card} t={t} /> : card.type === 'TEAM' ? <TeamBody card={card} t={t} /> : <MatchBody card={card} t={t} />}
    </Link>
  );
}
