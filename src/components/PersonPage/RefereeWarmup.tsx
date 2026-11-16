import { useTranslation } from '@/lib/i18n';
import css from './refereeWarmup.module.scss';

type Kind = 'ar1' | 'main' | 'ar2' | 'fourth';

/** Tek hakem figürü; konum dış `<g transform>`'da, animasyon iç gruplarda (CSS transform, transform özniteliğini ezmesin). */
function Official({ x, kind }: { x: number; kind: Kind }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <ellipse className={`${css.shadow} ${css[`shadow_${kind}`]}`} cx="0" cy="128" rx="17" ry="3.5" />
      <g className={`${css.body} ${css[`body_${kind}`]}`}>
        {/* bacaklar: kalçadan (y=84) döner */}
        <g transform="translate(-5 84)">
          <rect className={`${css.leg} ${css[`legL_${kind}`]}`} x="-2.6" y="0" width="5.2" height="38" rx="2.6" />
        </g>
        <g transform="translate(5 84)">
          <rect className={`${css.leg} ${css[`legR_${kind}`]}`} x="-2.6" y="0" width="5.2" height="38" rx="2.6" />
        </g>
        {/* şort + forma */}
        <rect className={css.shorts} x="-10" y="78" width="20" height="12" rx="3" />
        <rect className={css.shirt} x="-11" y="50" width="22" height="31" rx="6" />
        <rect className={css.stripe} x="-11" y="62" width="22" height="3" />
        <rect className={css.collar} x="-4" y="50" width="8" height="3" rx="1.5" />
        {/* kollar: omuzdan (y=54) döner */}
        <g transform="translate(-12 54)">
          <g className={`${css.arm} ${css[`armL_${kind}`]}`}>
            <rect className={css.armRect} x="-2.4" y="0" width="4.8" height="26" rx="2.4" />
            {kind === 'ar1' ? <Flag /> : null}
          </g>
        </g>
        <g transform="translate(12 54)">
          <g className={`${css.arm} ${css[`armR_${kind}`]}`}>
            <rect className={css.armRect} x="-2.4" y="0" width="4.8" height="26" rx="2.4" />
            {kind === 'ar2' ? <Flag /> : null}
            {kind === 'fourth' ? <Board /> : null}
          </g>
        </g>
        <circle className={css.head} cx="0" cy="40" r="9" />
        <path className={css.hair} d="M-9 38 a9 9 0 0 1 18 0 q-9 -5 -18 0z" />
        {kind === 'main' ? <circle className={css.whistle} cx="5" cy="58" r="2" /> : null}
      </g>
    </g>
  );
}

function Flag() {
  return (
    <g className={css.flag}>
      <rect x="-1" y="22" width="2" height="16" className={css.flagPole} />
      <rect x="1" y="22" width="12" height="9" className={css.flagCloth} />
      <rect x="1" y="22" width="6" height="4.5" className={css.flagCheck} />
      <rect x="7" y="26.5" width="6" height="4.5" className={css.flagCheck} />
    </g>
  );
}

function Board() {
  return (
    <g className={css.board}>
      <rect x="-10" y="24" width="22" height="14" rx="2" className={css.boardFrame} />
      <text x="1" y="34.5" textAnchor="middle" className={css.boardText}>
        +3
      </text>
    </g>
  );
}

/**
 * Hakem raporu hazırlanırken: sahada soldan sağa dört hakem ısınıyor (yardımcı – orta hakem – yardımcı – 4. hakem).
 * Her biri farklı hareket: yan adım + bayrak, dizleri yukarı çekme, kol çevirme, yerinde koşu + tabela.
 * `prefers-reduced-motion` açıksa durağan.
 */
export default function RefereeWarmup() {
  const { t } = useTranslation('match');
  const labels = [t('person.aiReportAr'), t('person.aiReportMainRef'), t('person.aiReportAr'), t('person.aiReportFourth')];
  const xs = [80, 230, 380, 530];
  const kinds: Kind[] = ['ar1', 'main', 'ar2', 'fourth'];
  return (
    <div className={css.wrap} role="status" aria-live="polite">
      <svg className={css.svg} viewBox="0 0 610 160" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="ref-warmup-grass" width="76" height="160" patternUnits="userSpaceOnUse">
            <rect width="38" height="160" className={css.grassA} />
            <rect x="38" width="38" height="160" className={css.grassB} />
          </pattern>
        </defs>
        <rect x="0" y="0" width="610" height="160" rx="12" fill="url(#ref-warmup-grass)" />
        <line x1="305" y1="0" x2="305" y2="160" className={css.line} />
        <circle cx="305" cy="80" r="34" className={css.lineCircle} />
        <rect x="0.75" y="0.75" width="608.5" height="158.5" rx="11.5" className={css.lineCircle} />
        {kinds.map((k, i) => (
          <Official key={k} x={xs[i]!} kind={k} />
        ))}
        <g className={css.ball}>
          <circle cx="0" cy="0" r="5.5" className={css.ballFill} />
          <path d="M0 -2.5 l2.4 1.7 -0.9 2.8 h-3 l-0.9 -2.8z" className={css.ballPatch} />
        </g>
      </svg>
      <ol className={css.labels} aria-hidden="true">
        {labels.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      <p className={css.text}>
        <span className={css.dot} aria-hidden="true" />
        {t('person.aiReportLoading')}
      </p>
    </div>
  );
}
