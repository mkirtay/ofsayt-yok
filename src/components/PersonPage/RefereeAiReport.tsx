import { useEffect, useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import type { RefereeReportResult, RefereeReportView } from '@/server/people/refereeReport';
import styles from './personPage.module.scss';
import css from './refereeAiReport.module.scss';

/** 202 (başka istek üretiyor) gelirse bu aralıkla, en çok bu kadar yeniden sor. */
const RETRY_MS = 4_000;
const MAX_RETRIES = 6;

/**
 * Hakem sayfası "AI hakem raporu": sayfa verisinden hesaplanan metriklerin model yorumu (`/api/referees/{id}/report`,
 * hakem başına önbellekli). ISR verisine girmez; istemcide çekilir. Sayfanın altında (geç gelen içerik kaydırmasın).
 * Rapor yoksa / üretilemezse bölüm hiç görünmez. Trend tablosundaki sayılar koddan (model tablo üretmez).
 */
export default function RefereeAiReport({ refereeId, name }: { refereeId: number; name: string }) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const [data, setData] = useState<RefereeReportView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      fetch(`/api/referees/${refereeId}/report`)
        .then(async (r) => {
          const body = (await r.json().catch(() => null)) as RefereeReportResult | null;
          if (cancelled) return;
          if (r.ok && body?.status === 'ready') return setData(body.data);
          if (r.status === 202 && attempt < MAX_RETRIES) {
            timer = setTimeout(() => load(attempt + 1), RETRY_MS);
            return;
          }
          setFailed(true);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refereeId]);

  if (failed) return null;
  const fmt = (n: number | null, digits = 2) => (n == null ? '—' : n.toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: digits }));
  const current = data?.trend[0];
  const sections: [string, string[]][] = data
    ? [
        [
          current && data.mainLeague
            ? t('person.aiReportCurrent', { season: current.seasonName, league: data.mainLeague })
            : t('person.aiReportCurrentNoLeague'),
          data.report.currentSeason,
        ],
        [t('person.aiReportTrend'), data.report.trend],
        [t('person.aiReportCompetitions'), data.report.competitions],
        [t('person.aiReportTeams'), data.report.teams],
        [t('person.aiReportRecent'), data.report.recent],
        [t('person.aiReportDataNotes'), data.report.dataNotes],
      ]
    : [];

  return (
    <section className={styles.card} aria-labelledby="ref-ai-report" aria-busy={data == null} data-testid="referee-ai-report">
      <h2 id="ref-ai-report" className={styles.sectionTitle}>
        {t('person.aiReportTitle')}
        <span className={styles.sectionSub}> · {name}</span>
      </h2>
      {data == null ? (
        <div className={css.loading}>
          <p className={css.loadingText}>{t('person.aiReportLoading')}</p>
          <div className={css.skeleton} aria-hidden="true" />
        </div>
      ) : (
        <div className={css.body}>
          <p className={css.summary}>{data.report.summary}</p>
          {sections.map(([title, items], i) =>
            items.length ? (
              <div key={title} className={css.block}>
                <h3 className={css.blockTitle}>{title}</h3>
                {i === 1 && data.trend.length > 0 ? (
                  <div className={styles.scroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('person.colSeason')}</th>
                          <th>{t('person.colMatches')}</th>
                          <th>{t('person.colYellowPm')}</th>
                          <th>{t('person.colRedPm')}</th>
                          <th>{t('person.colPenPm')}</th>
                          <th>{t('person.colFoulsPm')}</th>
                          <th>{t('person.colVarPm')}</th>
                          <th>{t('person.aiReportYellowPerFoul')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.trend.map((r) => (
                          <tr key={r.seasonName}>
                            <td>{r.seasonName}</td>
                            <td>{r.matches}</td>
                            <td>{fmt(r.yellow)}</td>
                            <td>{fmt(r.red)}</td>
                            <td>{fmt(r.penalties)}</td>
                            <td>{fmt(r.fouls)}</td>
                            <td>{fmt(r.var)}</td>
                            <td>{fmt(r.yellowPerFoul, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <ul className={css.list}>
                  {items.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <div className={css.block}>
            <h3 className={css.blockTitle}>{t('person.aiReportConclusion')}</h3>
            <p className={css.conclusion}>{data.report.conclusion}</p>
          </div>
        </div>
      )}
      <p className={styles.note}>
        {t('person.aiReportNote')}
        {data ? ` · ${new Date(data.generatedAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul' })}` : null}
      </p>
    </section>
  );
}
