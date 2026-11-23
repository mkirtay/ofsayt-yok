import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { buildMatchHref } from '@/utils/matchUrl';
import { trackGrowth } from '@/lib/growthEvents';
import { UEFA_CLUB_LEAGUE_IDS } from '@/config/refereeTableLeagues';
import type { RefereePageData } from '@/server/people/refereePage';
import type { RefereeRates } from '@/utils/refereeAverages';
import { personLeagueLabel } from './leagueLabel';
import { trKickoff, uefaCareer } from './RefereeProfileSide';
import styles from './personPage.module.scss';

const STAT_KEYS = [
  ['yellow', 'person.colYellowPm'],
  ['red', 'person.colRedPm'],
  ['penalties', 'person.colPenPm'],
] as const;

type Scope = { label: string; matches: number; rates: RefereeRates };

/**
 * İstatistiklerin kapsamı: sıradaki maç UEFA kulüp turnuvasındaysa hakemin UEFA kulüp maçları, değilse özet
 * kartlarının lig-sezonu. İkisini karıştırmayız (Bundesliga ortalaması UEFA maçına yazılmaz).
 */
export function nextMatchScope(data: RefereePageData, uefaLabel: string, ctxLabel: string): Scope | null {
  const next = data.upcoming?.[0];
  if (!next) return null;
  const uefa = uefaCareer(data.seasons);
  if (next.competition?.id != null && UEFA_CLUB_LEAGUE_IDS.has(next.competition.id)) {
    return uefa ? { label: uefaLabel, matches: uefa.matches, rates: uefa.rates } : null;
  }
  const ctx = data.summary.context;
  return ctx ? { label: ctxLabel, matches: ctx.matches, rates: ctx.rates } : null;
}

/** Hakem sayfasının üstünde sıradaki maç kartı: reklam / aramadan gelen "bizim maçın hakemi" sorusuna maç sayfası köprüsü. */
export default function RefereeNextMatch({ data, ctxLabel }: { data: RefereePageData; ctxLabel: string }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const next = data.upcoming?.[0];
  if (!next) return null;
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const href = buildMatchHref({ id: next.id, home_name: next.home.name, away_name: next.away.name });
  const scope = nextMatchScope(data, t('person.nextUefaScope'), ctxLabel);
  const comp = personLeagueLabel(next.competition?.id, tl, next.competition?.name || '');
  const onClick = () => trackGrowth('referee_match_click', { slot: 'next_card', referee_id: data.id, match_id: next.id });

  return (
    <section className={`${styles.card} ${styles.nextMatch}`} aria-labelledby="ref-next" data-testid="referee-next">
      <h2 id="ref-next" className={styles.nextEyebrow}>
        {t('person.nextTitle')}
        {comp ? <span className={styles.nextComp}> · {comp}</span> : null}
      </h2>
      <Link href={href} className={styles.nextTeams} prefetch={false} onClick={onClick}>
        <span className={styles.nextTeam}>
          <TeamLogo src={next.home.logo} width={32} />
          <span className={styles.nextTeamName}>{next.home.name}</span>
        </span>
        <span className={styles.nextWhen}>{next.date ? trKickoff(next.date, next.scheduled) : '–'}</span>
        <span className={`${styles.nextTeam} ${styles.nextTeamAway}`}>
          <span className={styles.nextTeamName}>{next.away.name}</span>
          <TeamLogo src={next.away.logo} width={32} />
        </span>
      </Link>
      {scope ? (
        <div className={styles.nextStatsWrap}>
          <dl className={styles.nextStats}>
            {STAT_KEYS.map(([k, label]) => (
              <div key={k}>
                <dt>{t(label)}</dt>
                <dd>{scope.rates[k] == null ? '—' : nf.format(scope.rates[k]!)}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.nextScope}>{t('person.nextScope', { scope: scope.label, count: scope.matches })}</p>
        </div>
      ) : null}
      <Link href={href} className={styles.nextCta} prefetch={false} onClick={onClick}>
        {t('person.nextCta')} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
