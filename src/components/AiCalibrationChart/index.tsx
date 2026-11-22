import type { CalibrationBand } from '@/utils/aiCalibration';
import { MIN_BAND_SAMPLE } from '@/utils/aiCalibration';
import styles from './aiCalibrationChart.module.scss';

/**
 * Kalibrasyon grafiği (AI isabet sayfası): her olasılık bandı bir nokta — x: kartta gösterilen ortalama olasılık,
 * y: gerçekleşme oranı. Kesik köşegen = tam kalibrasyon. Nokta çizginin üstündeyse kart olasılığı düşük gösteriyor.
 * Tek seri → lejant kutusu yok; az örnekli bant soluk. Altında aynı veri tablo olarak (erişilebilirlik).
 */
const W = 320;
const H = 240;
const PAD = { l: 50, r: 12, t: 12, b: 36 };
const MIN = 40;
const MAX = 100;
const x = (v: number) => PAD.l + ((v - MIN) / (MAX - MIN)) * (W - PAD.l - PAD.r);
const y = (v: number) => H - PAD.b - ((v - MIN) / (MAX - MIN)) * (H - PAD.t - PAD.b);
const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v));
const fmt = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export type AiCalibrationChartLabels = {
  axisX: string;
  axisY: string;
  diagonal: string;
  few: string;
  colBand: string;
  colCount: string;
  colShown: string;
  colActual: string;
  /** "%70–79: gösterilen ort. %75,5, gerçekleşen %80,7 (249 tahmin)" */
  tooltip: (b: { label: string; shown: string; actual: string; picks: number }) => string;
};

export default function AiCalibrationChart({ bands, labels }: { bands: CalibrationBand[]; labels: AiCalibrationChartLabels }) {
  const points = bands.filter((b) => b.picks > 0 && b.avgShown != null && b.rate != null);
  const ticks = [40, 60, 80, 100];
  return (
    <div className={styles.wrap}>
      <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels.axisX} / ${labels.axisY}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={styles.grid} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className={styles.tick} x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end">
              %{t}
            </text>
            <text className={styles.tick} x={x(t)} y={H - PAD.b + 16} textAnchor="middle">
              %{t}
            </text>
          </g>
        ))}
        <line className={styles.diagonal} x1={x(MIN)} y1={y(MIN)} x2={x(MAX)} y2={y(MAX)} />
        <text className={styles.diagLabel} x={x(66)} y={y(56)} textAnchor="start">
          {labels.diagonal}
        </text>
        <polyline
          className={styles.line}
          points={points.map((b) => `${x(clamp(b.avgShown!))},${y(clamp(b.rate!))}`).join(' ')}
        />
        {points.map((b) => {
          const cx = x(clamp(b.avgShown!));
          const cy = y(clamp(b.rate!));
          const few = b.picks < MIN_BAND_SAMPLE;
          return (
            <g key={b.label} className={styles.point}>
              <title>{labels.tooltip({ label: b.label, shown: fmt(b.avgShown!), actual: fmt(b.rate!), picks: b.picks })}</title>
              {/* Geniş, görünmez hedef: dokunma/üzerine gelme kolay olsun */}
              <circle className={styles.hit} cx={cx} cy={cy} r={14} />
              <circle className={few ? `${styles.dot} ${styles.dotFew}` : styles.dot} cx={cx} cy={cy} r={6} />
            </g>
          );
        })}
        <text className={styles.axis} x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle">
          {labels.axisX}
        </text>
        <text className={styles.axis} transform={`translate(11 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle">
          {labels.axisY}
        </text>
      </svg>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{labels.colBand}</th>
            <th scope="col">{labels.colCount}</th>
            <th scope="col">{labels.colShown}</th>
            <th scope="col">{labels.colActual}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((b) => (
            <tr key={b.label} className={b.picks < MIN_BAND_SAMPLE ? styles.rowFew : undefined}>
              <td>{b.label}</td>
              <td>
                {b.picks}
                {b.picks < MIN_BAND_SAMPLE ? <span className={styles.few}> · {labels.few}</span> : null}
              </td>
              <td>%{fmt(b.avgShown!)}</td>
              <td className={styles.actual}>%{fmt(b.rate!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
