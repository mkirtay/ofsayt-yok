import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import RatingBadge from '@/components/RatingBadge';
import { formatRating, RATING_TONE_VARS, ratingTone } from '@/config/ratingScale';
import { useI18n, useTranslation } from '@/lib/i18n';
import { MIN_MINUTES_FOR_AVERAGE } from '@/utils/playerVs';
import { CONSISTENCY_MIN_MATCHES, ratingChartLayout, type RatingPoint, type RatingSeries, type RatingSummary } from '@/utils/ratingTrend';
import styles from './ratingTrend.module.scss';

const LOCALE_TAGS: Record<string, string> = { tr: 'tr-TR', en: 'en-GB' };
const HEIGHT = 200;
// Sağ boşluk ortalama etiketine ("Ort. 7.03") ayrılmış: etiket çizim alanının DIŞINDA, noktalarla çakışmaz
const BOX = { height: HEIGHT, padTop: 12, padRight: 56, padBottom: 24, padLeft: 30 };
/** SSR / ölçüm öncesi genişlik — ilk ölçümde gerçek kapsayıcı genişliğine geçer. */
const FALLBACK_WIDTH = 560;

function shortDate(iso: string | undefined, locale: string, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? LOCALE_TAGS.tr, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(d);
}

/** Kapsayıcı genişliği (ResizeObserver); SSR'da `FALLBACK_WIDTH`. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Opponent({ p, t }: { p: RatingPoint; t: (k: string) => string }) {
  return (
    <span className={styles.opponent}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 16px CDN takım logosu; sayfanın diğer logolarıyla aynı düz <img> */}
      {p.opponentLogo ? <img src={p.opponentLogo} alt="" width={16} height={16} className={styles.logo} loading="lazy" /> : null}
      <span className={styles.opponentName}>{p.opponent}</span>
      <span className={styles.venue}>{p.isHome ? t('ratingTrend.home') : t('ratingTrend.away')}</span>
    </span>
  );
}

export type RatingTrendChartProps = {
  series: RatingSeries;
  /** 15'+ maç yoksa `null`: noktalar yine çizilir, özet "—" */
  summary: RatingSummary | null;
};

/**
 * Son maçların rating çizgisi (SVG, bağımlılıksız). Hesaplama `utils/ratingTrend` (saf; mobil aynısını kullanır),
 * burada yalnızca render + etkileşim: fare üstü / odak → ipucu; tıklama → maç detayı. Dokunmatikte ilk dokunuş ipucunu
 * açar, aynı noktaya ikinci dokunuş (ya da ipucundaki "Maça git") maça gider.
 */
export default function RatingTrendChart({ series, summary }: RatingTrendChartProps) {
  const { t } = useTranslation('player');
  const { locale } = useI18n();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const lastPointer = useRef<string>('mouse');
  const srId = useId();

  const layout = ratingChartLayout(series.points, { ...BOX, width }, summary?.average ?? null);
  const dot = active != null ? layout.dots[active] : null;
  const avgText = formatRating(summary?.average) ?? '—';
  const n = series.points.length;
  const counted = n - series.shortCount;
  const shortText = t('ratingTrend.shortMatch', { min: MIN_MINUTES_FOR_AVERAGE });

  const pointLabel = (p: RatingPoint) =>
    t('ratingTrend.pointLabel', {
      date: shortDate(p.date, locale, true),
      venue: p.isHome ? t('ratingTrend.home') : t('ratingTrend.away'),
      opponent: p.opponent,
      score: p.score ?? '—',
      rating: formatRating(p.rating) ?? '—',
    }) + (p.short ? ` — ${shortText}` : '');

  const go = (p: RatingPoint) => void Router.push(`/matches/${p.matchId}`);

  return (
    <div className={styles.root}>
      <dl className={styles.summary}>
        <div className={styles.stat}>
          <dt>{t('ratingTrend.average')}</dt>
          <dd>
            <RatingBadge rating={summary?.average} size="md" showEmpty />
          </dd>
        </div>
        {summary && counted > 1 ? (
          <>
            <div className={styles.stat}>
              <dt>{t('ratingTrend.best')}</dt>
              <dd className={styles.extreme}>
                <RatingBadge rating={summary.best.rating} />
                <Opponent p={summary.best} t={t} />
                <span className={styles.muted}>{shortDate(summary.best.date, locale)}</span>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>{t('ratingTrend.worst')}</dt>
              <dd className={styles.extreme}>
                <RatingBadge rating={summary.worst.rating} />
                <Opponent p={summary.worst} t={t} />
                <span className={styles.muted}>{shortDate(summary.worst.date, locale)}</span>
              </dd>
            </div>
          </>
        ) : null}
        <div className={styles.stat}>
          <dt>{t('ratingTrend.consistency')}</dt>
          <dd>
            {summary?.consistency ? (
              <span
                className={`${styles.consistency} ${styles[summary.consistency]}`}
                title={t('ratingTrend.consistencyHint', { sd: summary.stdDev.toFixed(2) })}
                data-testid="rating-consistency"
              >
                {t(`ratingTrend.consistencyLabel.${summary.consistency}`)}
                <span className={styles.sigma}>σ {summary.stdDev.toFixed(2)}</span>
              </span>
            ) : (
              <span className={styles.muted}>{t('ratingTrend.consistencyTooFew', { min: CONSISTENCY_MIN_MATCHES })}</span>
            )}
          </dd>
        </div>
      </dl>
      {series.shortCount > 0 ? (
        <p className={styles.shortNote} data-testid="rating-short-note">
          {t('ratingTrend.shortNote', { count: series.shortCount, min: MIN_MINUTES_FOR_AVERAGE })}
        </p>
      ) : null}

      <div className={styles.chart} ref={wrapRef} onPointerLeave={() => lastPointer.current !== 'touch' && setActive(null)}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className={styles.svg}
          role="group"
          aria-labelledby={srId}
          data-testid="rating-trend-svg"
        >
          {layout.ticks.map((tk) => (
            <g key={tk.value} aria-hidden="true">
              <line x1={BOX.padLeft} x2={width - BOX.padRight} y1={tk.y} y2={tk.y} className={styles.grid} />
              <text x={BOX.padLeft - 6} y={tk.y} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                {Number.isInteger(tk.value) ? tk.value : tk.value.toFixed(1)}
              </text>
            </g>
          ))}
          {n > 0 ? (
            <g aria-hidden="true">
              <text x={layout.dots[0].x} y={HEIGHT - 6} className={styles.axisLabel} textAnchor={n > 1 ? 'start' : 'middle'}>
                {shortDate(layout.dots[0].date, locale)}
              </text>
              {n > 1 ? (
                <text x={layout.dots[n - 1].x} y={HEIGHT - 6} className={styles.axisLabel} textAnchor="end">
                  {shortDate(layout.dots[n - 1].date, locale)}
                </text>
              ) : null}
            </g>
          ) : null}
          {layout.averageY != null ? (
            <g aria-hidden="true">
              <line x1={BOX.padLeft} x2={width - BOX.padRight} y1={layout.averageY} y2={layout.averageY} className={styles.avgLine} />
              <text x={width - BOX.padRight + 6} y={layout.averageY} className={styles.avgLabel} dominantBaseline="middle">
                {t('ratingTrend.averageLine', { value: avgText })}
              </text>
            </g>
          ) : null}
          {n > 1 ? <polyline points={layout.linePoints} className={styles.line} aria-hidden="true" /> : null}
          {layout.dots.map((d, i) => {
            const tone = ratingTone(d.rating);
            return (
              <a
                key={d.matchId}
                href={`/matches/${d.matchId}`}
                aria-label={pointLabel(d)}
                className={styles.point}
                data-tone={tone}
                onPointerDown={(e) => {
                  lastPointer.current = e.pointerType;
                }}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // yeni sekme vb. tarayıcıya kalsın
                  e.preventDefault();
                  if (lastPointer.current === 'touch' && active !== i) {
                    setActive(i);
                    return;
                  }
                  go(d);
                }}
              >
                <circle cx={d.x} cy={d.y} r={14} className={styles.hit} />
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={active === i ? 7 : d.short ? 4 : 5}
                  className={d.short ? `${styles.dot} ${styles.dotShort}` : styles.dot}
                  data-short={d.short || undefined}
                  style={{ fill: RATING_TONE_VARS[tone].bg }}
                />
              </a>
            );
          })}
        </svg>

        {dot ? (
          <div
            className={styles.tooltip}
            role="tooltip"
            style={{
              left: Math.min(Math.max(dot.x, 110), width - 110), // ipucu en fazla 220px: kenardan taşmasın
              top: dot.y,
              transform: dot.y < HEIGHT / 2 ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))',
            }}
            data-testid="rating-tooltip"
          >
            <div className={styles.tooltipDate}>{shortDate(dot.date, locale, true)}</div>
            <div className={styles.tooltipRow}>
              <Opponent p={dot} t={t} />
              <span className={styles.tooltipScore}>{dot.score ?? '—'}</span>
            </div>
            {dot.short ? <div className={styles.tooltipShort}>{shortText}</div> : null}
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipRating}>
                <RatingBadge rating={dot.rating} />
                {dot.minutes != null ? <span className={styles.muted}>{dot.minutes}&apos;</span> : null}
              </span>
              <Link href={`/matches/${dot.matchId}`} className={styles.tooltipLink} prefetch={false}>
                {t('ratingTrend.goToMatch')} →
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <p id={srId} className={styles.srOnly}>
        {summary
          ? t('ratingTrend.srSummary', {
              count: n,
              average: avgText,
              best: formatRating(summary.best.rating),
              bestOpponent: summary.best.opponent,
              bestDate: shortDate(summary.best.date, locale, true),
              worst: formatRating(summary.worst.rating),
              worstOpponent: summary.worst.opponent,
              worstDate: shortDate(summary.worst.date, locale, true),
            })
          : t('ratingTrend.srSummaryNoAverage', { count: n })}
        {series.shortCount > 0 ? ` ${t('ratingTrend.shortNote', { count: series.shortCount, min: MIN_MINUTES_FOR_AVERAGE })}` : ''}
        {summary?.consistency ? ` ${t('ratingTrend.srConsistency', { label: t(`ratingTrend.consistencyLabel.${summary.consistency}`) })}` : ''}
      </p>
    </div>
  );
}
