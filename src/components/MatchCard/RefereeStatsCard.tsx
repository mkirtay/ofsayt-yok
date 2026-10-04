import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import { refereeHref } from '@/utils/personUrl';
import { useRefereeSummary } from '@/hooks/useMatchInfoExtras';
import { REFEREE_FEW_MATCHES, type RefereeSeasonLine } from '@/services/sportmonks/refereeStats';
import styles from './matchInfo.module.scss';

type Props = { refereeId: number; refereeName: string; seasonId: number; leagueId?: number; id: string };

/**
 * Hakem istatistik kartı (hakem adına tıklanınca açılır — kullanıcı girdisi, CLS sayılmaz). Maç sayısı her zaman
 * görünür; bu sezon 5 maçtan azsa geçen sezon da (varsa). Yalnız sayılar.
 */
export default function RefereeStatsCard({ refereeId, refereeName, seasonId, leagueId, id }: Props) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const q = useRefereeSummary(refereeId, seasonId, leagueId, true);
  const num = (n: number) => n.toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

  const lines = (l: RefereeSeasonLine) =>
    (
      [
        ['refereeYellow', l.yellowPerMatch],
        ['refereeRed', l.redPerMatch],
        ['refereePenalties', l.penaltiesPerMatch],
        ['refereeFouls', l.foulsPerMatch],
        ['refereeVar', l.varPerMatch],
      ] as const
    ).filter(([, v]) => v != null);

  const block = (l: RefereeSeasonLine, heading: string) => (
    <div className={styles.refSeason}>
      <p className={styles.refHeading}>{heading}</p>
      {l.matches > 0 && lines(l).length ? (
        <dl className={styles.refGrid}>
          {lines(l).map(([key, v]) => (
            <div key={key} className={styles.refCell}>
              <dt>{t(`matchInfo.${key}`)}</dt>
              <dd>{num(v as number)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );

  return (
    <div id={id} className={styles.refCard} role="region" aria-live="polite">
      {q.isLoading ? (
        <p className={styles.refMuted}>{t('matchInfo.refereeLoading')}</p>
      ) : !q.data ? (
        <p className={styles.refMuted}>{t('matchInfo.refereeUnavailable')}</p>
      ) : (
        <>
          {block(q.data.current, t('matchInfo.refereeThisSeason', { count: q.data.current.matches }))}
          {q.data.current.matches < REFEREE_FEW_MATCHES && q.data.previous
            ? block(q.data.previous, t('matchInfo.refereeLastSeason', { season: q.data.previous.seasonName, count: q.data.previous.matches }))
            : null}
        </>
      )}
      <Link href={refereeHref(refereeId, q.data?.name || refereeName)} className={styles.refProfileLink} prefetch={false}>
        {t('person.refereeProfileLink')}
      </Link>
    </div>
  );
}
