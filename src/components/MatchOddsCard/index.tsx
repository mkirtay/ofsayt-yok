import { useEffect, useId, useState } from 'react';
import '@/lib/i18nNamespaces/combo';
import { useTranslation } from '@/lib/i18n';
import type { MatchOddsView } from '@/services/apiFootball/oddsMarkets';
import styles from './matchOddsCard.module.scss';

const fmt = (o: number) => o.toFixed(2).replace('.', ',');
const fmtLine = (l: number) => String(l).replace('.', ',');

/**
 * Milli maç detayı "Piyasa oranları" kartı (İstatistik / Olay kartlarıyla aynı yüzey). MatchDetailContent onu YALNIZ milli maçta
 * ve oturumda `comboAccess` varken `next/dynamic` ile yükler; mount'ta en çok 1 istek, veri yoksa / hata → kart çizilmez
 * (sayfa kaymaz, çünkü kart akışın içinde sonradan eklenir ve üstündeki içeriği itmez).
 */
export default function MatchOddsCard({ matchId }: { matchId: string }) {
  const { t } = useTranslation('combo');
  const [odds, setOdds] = useState<MatchOddsView | null>(null);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    setOdds(null);
    fetch(`/api/combo/match-odds?id=${encodeURIComponent(matchId)}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ odds: MatchOddsView | null }>) : null))
      .then((d) => !cancelled && setOdds(d?.odds ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (!odds) return null;
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('marketOdds.title')} <span className={styles.badge}>{t('marketOdds.testBadge')}</span>
      </h2>
      {odds.result ? (
        <div className={styles.block}>
          <div className={styles.label}>{t('marketOdds.result')}</div>
          <div className={styles.cells}>
            <Cell label={t('marketOdds.home')} value={fmt(odds.result.home)} />
            <Cell label={t('marketOdds.draw')} value={fmt(odds.result.draw)} />
            <Cell label={t('marketOdds.away')} value={fmt(odds.result.away)} />
          </div>
        </div>
      ) : null}
      {odds.totals.map((row) => (
        <div key={row.line} className={styles.block}>
          <div className={styles.label}>
            {t('marketOdds.goals')} {fmtLine(row.line)}
          </div>
          <div className={styles.cells}>
            <Cell label={t('marketOdds.over')} value={fmt(row.over)} />
            <Cell label={t('marketOdds.under')} value={fmt(row.under)} />
          </div>
        </div>
      ))}
      {odds.btts ? (
        <div className={styles.block}>
          <div className={styles.label}>{t('marketOdds.btts')}</div>
          <div className={styles.cells}>
            <Cell label={t('marketOdds.yes')} value={fmt(odds.btts.yes)} />
            <Cell label={t('marketOdds.no')} value={fmt(odds.btts.no)} />
          </div>
        </div>
      ) : null}
      <p className={styles.source}>{t('marketOdds.source', { bookmaker: odds.bookmaker })}</p>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.cell}>
      <span className={styles.cellLabel}>{label}</span>
      <span className={styles.cellValue}>{value}</span>
    </div>
  );
}
