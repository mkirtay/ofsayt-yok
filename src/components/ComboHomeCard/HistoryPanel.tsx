import { useEffect, useState } from 'react';
import TeamLogo from '@/components/TeamLogo';
import type { CouponHistory, HistoryCoupon, HistoryStatus, HistorySummary } from '@/utils/comboHistory';
import styles from './comboHomeCard.module.scss';

type TFn = (key: string, opts?: Record<string, unknown>) => string;
type State = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: CouponHistory };

const pct1 = (p: number) => `%${(p * 100).toFixed(1).replace('.', ',')}`;
const odd = (o: number) => o.toFixed(2).replace('.', ',');
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
const dayLabel = (iso: string) => dayFmt.format(new Date(`${iso}T12:00:00Z`));

const STATUS_CLASS: Record<HistoryStatus, string> = { hit: styles.stHit, miss: styles.stMiss, void: styles.stVoid, pending: styles.stPending };
const LEG_MARK = (hit: boolean | null) => (hit === true ? '✓' : hit === false ? '✗' : '•');

/** "Geçmiş" sekmesi: verilen tüm kuponlar ve sonucu (gece değerlendirme işi sonuçlandırır) + özet. */
export default function HistoryPanel({ t, initial }: { t: TFn; /** Test / önizleme: istek atmadan bu veriyle çizer. */ initial?: CouponHistory }) {
  const [s, setS] = useState<State>(initial ? { state: 'ready', data: initial } : { state: 'loading' });
  useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch('/api/combo/history', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<CouponHistory>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => alive && setS({ state: 'ready', data }))
      .catch(() => alive && setS({ state: 'error' }));
    return () => {
      alive = false;
    };
  }, [initial]);

  if (s.state === 'loading') return <p className={styles.muted}>{t('loading')}</p>;
  if (s.state === 'error') return <p className={styles.muted}>{t('error')}</p>;
  const { coupons, summary, byKind } = s.data;
  if (coupons.length === 0) return <p className={styles.muted}>{t('past.empty')}</p>;

  const days = [...new Set(coupons.map((c) => c.day))];
  return (
    <div className={styles.past}>
      <SummaryBox summary={summary} byKind={byKind} t={t} />
      {days.map((d) => (
        <section key={d} className={styles.pastDay} aria-label={dayLabel(d)}>
          <h3 className={styles.pastDayTitle}>{dayLabel(d)}</h3>
          {coupons
            .filter((c) => c.day === d)
            .map((c) => (
              <PastCoupon key={`${c.day}-${c.kind}`} c={c} t={t} />
            ))}
        </section>
      ))}
    </div>
  );
}

function SummaryBox({ summary, byKind, t }: { summary: HistorySummary; byKind: Record<string, HistorySummary>; t: TFn }) {
  return (
    <div className={styles.pastSummary}>
      <p className={styles.pastHeadline}>
        {summary.settled > 0
          ? t('past.headline', { hits: summary.hits, settled: summary.settled, rate: pct1(summary.hitRate ?? 0) })
          : t('past.noneSettled')}
      </p>
      {summary.avgProbability != null ? <p className={styles.small}>{t('past.expected', { pct: pct1(summary.avgProbability) })}</p> : null}
      <ul className={styles.pastKinds}>
        {(['safe', 'balanced', 'bold'] as const).map((k) => (
          <li key={k}>
            <span>{t(`presets.${k}`)}</span>
            <strong>{byKind[k]?.settled ? `${byKind[k]!.hits}/${byKind[k]!.settled}` : '—'}</strong>
          </li>
        ))}
      </ul>
      {summary.pending > 0 ? <p className={styles.small}>{t('past.pendingCount', { n: summary.pending })}</p> : null}
    </div>
  );
}

function PastCoupon({ c, t }: { c: HistoryCoupon; t: TFn }) {
  return (
    <div className={styles.pastCoupon}>
      <div className={styles.pastCouponHead}>
        <span className={styles.pastKind}>{t(`presets.${c.kind}`)}</span>
        <span className={styles.small}>
          {c.refOdds != null ? t('presets.marketOdds') : t('presets.odds')} {odd(c.refOdds ?? c.fairOdds)} · {pct1(c.probability)}
        </span>
        <span className={`${styles.pastStatus} ${STATUS_CLASS[c.status]}`}>{t(`past.status.${c.status}`)}</span>
      </div>
      <ul className={styles.list}>
        {c.legs.map((l) => (
          <li key={l.matchId} className={styles.row}>
            <span className={styles.teams}>
              <TeamLogo src={l.homeLogo} width={16} alt="" />
              <TeamLogo src={l.awayLogo} width={16} alt="" />
              <span className={styles.names}>
                {l.homeName} – {l.awayName}
              </span>
            </span>
            <span className={styles.pickText}>{t(`pick.${l.key}`)}</span>
            <span
              className={`${styles.legMark} ${l.hit === true ? styles.stHit : l.hit === false ? styles.stMiss : styles.stPending}`}
              aria-label={t(l.hit === true ? 'past.legHit' : l.hit === false ? 'past.legMiss' : 'past.legPending')}
              title={t(l.hit === true ? 'past.legHit' : l.hit === false ? 'past.legMiss' : 'past.legPending')}
            >
              {LEG_MARK(l.hit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
