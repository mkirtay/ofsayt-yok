import { useEffect, useId, useState } from 'react';
import '@/lib/i18nNamespaces/combo';
import { useTranslation } from '@/lib/i18n';
import { MAIN_TOTAL_LINES, type MatchOddsView } from '@/services/apiFootball/oddsMarkets';
import styles from './matchOddsCard.module.scss';

const fmt = (o: number) => o.toFixed(2).replace('.', ',');
const fmtLine = (l: number) => String(l).replace('.', ',');
const fmtHandicap = (l: number) => `${l > 0 ? '+' : l < 0 ? '−' : ''}${fmtLine(Math.abs(l))}`;

/**
 * Milli maç detayı "Piyasa oranları" kartı (Sofascore tarzı kompakt): ilk görünüm yalnız "Maç Sonucu" (1 X 2); "Ek oranlar" açılınca
 * Çifte Şans, İlk Yarı Sonucu, Beraberlikte İade, Karşılıklı Gol, Toplam Gol, Handikap — yalnız AF yanıtında gerçekten gelenler.
 * Oran artış / azalış oku YOK (oran geçmişi tutulmuyor). MatchDetailContent onu YALNIZ milli maçta ve oturumda `comboAccess`
 * varken `next/dynamic` ile yükler; mount'ta en çok 1 istek, veri yoksa / hata → kart çizilmez.
 */
export default function MatchOddsCard({ matchId }: { matchId: string }) {
  const { t } = useTranslation('combo');
  const [odds, setOdds] = useState<MatchOddsView | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const moreId = useId();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/combo/match-odds?id=${encodeURIComponent(matchId)}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ odds: MatchOddsView | null }>) : null))
      .then((d) => !cancelled && setOdds(d?.odds ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (!odds) return null;
  const main = odds.totals.filter((r) => (MAIN_TOTAL_LINES as readonly number[]).includes(r.line));
  const rest = odds.totals.filter((r) => !(MAIN_TOTAL_LINES as readonly number[]).includes(r.line));
  const hasMore = Boolean(odds.doubleChance || odds.firstHalf || odds.drawNoBet || odds.btts || odds.totals.length || odds.handicap.length);

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('marketOdds.title')} <span className={styles.badge}>{t('marketOdds.testBadge')}</span>
      </h2>

      {odds.result ? (
        <Block label={t('marketOdds.result')}>
          <Cells>
            <Cell k="1" v={fmt(odds.result.home)} />
            <Cell k="X" v={fmt(odds.result.draw)} />
            <Cell k="2" v={fmt(odds.result.away)} />
          </Cells>
        </Block>
      ) : null}

      {hasMore ? (
        <button type="button" className={styles.more} aria-expanded={open} aria-controls={moreId} onClick={() => setOpen((v) => !v)}>
          {open ? t('marketOdds.less') : t('marketOdds.more')} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      ) : null}

      {open ? (
        <div id={moreId} className={styles.extra}>
          {odds.doubleChance ? (
            <Block label={t('marketOdds.doubleChance')}>
              <Cells>
                <Cell k="1X" v={fmt(odds.doubleChance.homeDraw)} />
                <Cell k="X2" v={fmt(odds.doubleChance.drawAway)} />
                <Cell k="12" v={fmt(odds.doubleChance.homeAway)} />
              </Cells>
            </Block>
          ) : null}
          {odds.firstHalf ? (
            <Block label={t('marketOdds.firstHalf')}>
              <Cells>
                <Cell k="1" v={fmt(odds.firstHalf.home)} />
                <Cell k="X" v={fmt(odds.firstHalf.draw)} />
                <Cell k="2" v={fmt(odds.firstHalf.away)} />
              </Cells>
            </Block>
          ) : null}
          {odds.drawNoBet ? (
            <Block label={t('marketOdds.drawNoBet')}>
              <Cells>
                <Cell k="1" v={fmt(odds.drawNoBet.home)} />
                <Cell k="2" v={fmt(odds.drawNoBet.away)} />
              </Cells>
            </Block>
          ) : null}
          {odds.btts ? (
            <Block label={t('marketOdds.btts')}>
              <Cells>
                <Cell k={t('marketOdds.yes')} v={fmt(odds.btts.yes)} />
                <Cell k={t('marketOdds.no')} v={fmt(odds.btts.no)} />
              </Cells>
            </Block>
          ) : null}
          {odds.totals.length > 0 ? (
            <Block label={t('marketOdds.goals')}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">{t('marketOdds.over')}</th>
                    <th scope="col">{t('marketOdds.under')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...main, ...rest].map((r, i) => (
                    <tr key={r.line} className={i === main.length && main.length > 0 && rest.length > 0 ? styles.divider : undefined}>
                      <th scope="row">{fmtLine(r.line)}</th>
                      <td>{fmt(r.over)}</td>
                      <td>{fmt(r.under)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          ) : null}
          {odds.handicap.length > 0 ? (
            <Block label={t('marketOdds.handicap')}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">1</th>
                    <th scope="col">2</th>
                  </tr>
                </thead>
                <tbody>
                  {odds.handicap.map((r) => (
                    <tr key={r.line}>
                      <th scope="row">
                        {fmtHandicap(r.line)} / {fmtHandicap(-r.line)}
                      </th>
                      <td>{fmt(r.home)}</td>
                      <td>{fmt(r.away)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          ) : null}
        </div>
      ) : null}

      <p className={styles.source}>{t('marketOdds.source', { bookmaker: odds.bookmaker })}</p>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.label}>{label}</div>
      {children}
    </div>
  );
}

function Cells({ children }: { children: React.ReactNode }) {
  return <div className={styles.cells}>{children}</div>;
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className={styles.cell}>
      <span className={styles.cellKey}>{k}</span>
      <span className={styles.cellValue}>{v}</span>
    </div>
  );
}
