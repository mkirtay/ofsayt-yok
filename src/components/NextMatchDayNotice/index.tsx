import { Fragment, useMemo } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import { useUpcomingMatchDays } from '@/hooks/useHomeHubMatches';
import { leagueNameById } from '@/utils/leagueName';
import { formatDayMonth, formatDayMonthLocative, pickNextMatchDays } from '@/utils/nextMatchDay';
import styles from '@/pages/index.module.scss';

type Props = {
  /** Seçili gün — bundan SONRAKİ ilk maç günleri gösterilir. */
  from: string;
  /** Aktif lig filtresi (`null` = Tümü). */
  leagueIds: ReadonlySet<number> | null;
  onGoToDate: (iso: string) => void;
};

/**
 * Seçili günde maç yokken sıradaki maç günü ("Süper Lig 9 Ekim'de dönüyor"). Yalnız satır içi öğeler:
 * `EmptyState` içeriği bir `<p>` içinde. Veri yoksa / yüklenirken hiçbir şey göstermez.
 */
export default function NextMatchDayNotice({ from, leagueIds, onGoToDate }: Props) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const { data } = useUpcomingMatchDays(from, true);
  const picks = useMemo(() => pickNextMatchDays(data ?? [], leagueIds), [data, leagueIds]);
  if (picks.length === 0) return null;

  const go = (iso: string, label: string) => (
    <button type="button" className={styles.emptyAction} onClick={() => onGoToDate(iso)}>
      {label}
    </button>
  );

  if (!leagueIds) {
    const first = picks[0]!;
    return (
      <>
        {' '}
        {t('hub.nextMatchDayAll')} {go(first.date, formatDayMonth(first.date, locale))}
      </>
    );
  }

  if (picks.length === 1) {
    const only = picks[0]!;
    return (
      <>
        {' '}
        {go(
          only.date,
          t('hub.nextMatchDayLeague', {
            league: leagueNameById(only.leagueId, null, tl),
            date: formatDayMonthLocative(only.date, locale),
          }),
        )}
      </>
    );
  }

  return (
    <>
      {' '}
      {t('hub.nextMatchDaysTitle')}{' '}
      {picks.map((p, i) => (
        <Fragment key={p.leagueId}>
          {i > 0 ? ' · ' : null}
          {go(p.date, `${leagueNameById(p.leagueId, null, tl)} ${formatDayMonth(p.date, locale)}`)}
        </Fragment>
      ))}
    </>
  );
}
