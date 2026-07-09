import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { buildMatchHref } from '@/utils/matchUrl';
import type { MyAnalysisItem } from '@/pages/api/credits/my-analyses';
import styles from './header.module.scss';

export default function MyAnalysesDropdown() {
  const { t } = useTranslation('nav');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MyAnalysisItem[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      try {
        const res = await fetch('/api/credits/my-analyses');
        if (res.ok) {
          const body = (await res.json()) as { items: MyAnalysisItem[] };
          setItems(body.items);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      }
    }
  }

  return (
    <div className={styles.myAnalysesWrap} ref={wrapRef}>
      <button type="button" className={styles.headerNavPill} onClick={() => void toggleOpen()}>
        {t('myAnalyses')}
      </button>
      {open && (
        <div className={styles.myAnalysesDropdown}>
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
        </div>
      )}
    </div>
  );
}
