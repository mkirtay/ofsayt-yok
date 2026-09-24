import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { buildMatchHref } from '@/utils/matchUrl';
import type { GundemMatchBadge, GundemMatchTeam } from '@/types/gundem';
import styles from './postMatchBadge.module.scss';

/** Rozette gösterilen ad: kısa kod varsa o ("GAL"), yoksa tam ad. Tam adlar `title`/erişilebilir adda kalır. */
export function badgeTeamLabel(team: GundemMatchTeam): string {
  return team.shortName?.trim() || team.name;
}

export function matchBadgeHref(match: GundemMatchBadge): string {
  return buildMatchHref({ id: match.fixtureId as never, home: { name: match.home.name }, away: { name: match.away.name } });
}

function Team({ team }: { team: GundemMatchTeam }) {
  return (
    <span className={styles.team}>
      {team.logo ? <Image src={team.logo} alt="" width={14} height={14} className={styles.logo} unoptimized /> : null}
      <span className={styles.name}>{badgeTeamLabel(team)}</span>
    </span>
  );
}

/**
 * Maç postu rozeti: "[logo] GAL – [logo] FC Barcelona" → maç detayına bağlantı. Tek satır, taşarsa kısalır.
 * Canlı durumu bilinçli olarak YOK: snapshot'ta maç durumu tutulmuyor (saniyeler içinde eskir) ve kart başına canlı
 * sorgu akış maliyetini katlar; tahmini "başlama saati + 2 sa" penceresi ise ertelenen/devre arası maçlarda yanlış olur.
 */
export default function PostMatchBadge({ match }: { match: GundemMatchBadge }) {
  const { t } = useTranslation('gundem');
  const full = `${match.home.name} – ${match.away.name}`;
  return (
    <Link href={matchBadgeHref(match)} className={styles.badge} title={t('post.matchBadge', { match: full })} aria-label={t('post.matchBadge', { match: full })}>
      <Team team={match.home} />
      <span className={styles.sep} aria-hidden="true">
        –
      </span>
      <Team team={match.away} />
    </Link>
  );
}
