import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { buildMatchHref } from '@/utils/matchUrl';
import type { MyAnalysisItem } from '@/pages/api/credits/my-analyses';
import styles from './header.module.scss';

/** Kullanıcının ürettiği AI analizleri — mount olduğunda çeker (açılır menü açılınca render edilir). */
export default function MyAnalysesList() {
  const { t } = useTranslation('nav');
  const [items, setItems] = useState<MyAnalysisItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/my-analyses')
      .then((res) => (res.ok ? (res.json() as Promise<{ items: MyAnalysisItem[] }>) : { items: [] as MyAnalysisItem[] }))
      .then((body) => {
        if (!cancelled) setItems(body.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {items === null && <div className={styles.myAnalysesEmpty}>{t('common:loading')}</div>}
      {items?.length === 0 && <div className={styles.myAnalysesEmpty}>—</div>}
      {items?.map((item) => (
        <Link
          key={item.matchId}
          href={buildMatchHref({
            id: item.matchId as unknown as number,
            home: { name: item.homeTeamName },
            away: { name: item.awayTeamName },
          })}
          className={styles.myAnalysesItem}
        >
          <span className={styles.myAnalysesTeams}>
            {item.homeTeamName} - {item.awayTeamName}
          </span>
          {item.evaluatedAt && (
            <span className={styles.myAnalysesScore}>
              {item.hitCount}/{item.totalMarketsEvaluated}
            </span>
          )}
        </Link>
      ))}
    </>
  );
}
