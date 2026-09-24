import { useTranslation } from '@/lib/i18n';
import styles from './heatmapPitch.module.scss';

type ZoneGrid = number[]; // 15 değer: index = bölge*5 + kolon

interface HeatmapPitchProps {
  homeGrid: ZoneGrid;
  awayGrid: ZoneGrid;
  homeName: string;
  awayName: string;
}

const ZONES = 3; // 0 = kendi savunma, 1 = orta saha, 2 = rakip kaleye yakın hücum
const COLS = 5; // 0 = sol kanat, 1 = sol iç, 2 = merkez, 3 = sağ iç, 4 = sağ kanat

// viewBox koordinatları — yatay saha: ev sahibi kalesi solda, deplasman kalesi sağda.
const VB_W = 600;
const VB_H = 400;
const HALF_LINE_X = VB_W / 2;
const MARGIN = 10;

// Bölge (savunma → hücum) x ekseninde: ev sahibi soldan sağa, deplasman sağdan sola hücum eder.
const HOME_ZONE_X = [68, 172, 262];
const AWAY_ZONE_X = [532, 428, 338];
// Kolon (sol kanat → sağ kanat) y ekseninde: sağa hücum eden ev sahibinin sol kanadı üstte,
// sola hücum eden deplasmanın sol kanadı altta.
const HOME_COL_Y = [48, 124, 200, 276, 352];
const AWAY_COL_Y = [352, 276, 200, 124, 48];

function clampGrid(grid: ZoneGrid | undefined): number[] {
  const arr = Array.isArray(grid) ? grid : [];
  return Array.from({ length: ZONES * COLS }, (_, i) => {
    const v = Number(arr[i]);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  });
}

type ColorStop = { at: number; rgb: [number, number, number]; alpha: number };

// Sarı → turuncu → koyu kırmızı sıcaklık skalası (YlOrRd tarzı, matplotlib contour'a yakın).
const STOPS: ColorStop[] = [
  { at: 0, rgb: [255, 255, 204], alpha: 0 },
  { at: 25, rgb: [255, 237, 160], alpha: 0.45 },
  { at: 50, rgb: [253, 141, 60], alpha: 0.62 },
  { at: 75, rgb: [227, 26, 28], alpha: 0.72 },
  { at: 100, rgb: [128, 0, 38], alpha: 0.82 },
];

function heatFill(value: number): string {
  const v = Math.max(0, Math.min(100, value));
  let lo = STOPS[0]!;
  let hi = STOPS[STOPS.length - 1]!;
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (v >= STOPS[i]!.at && v <= STOPS[i + 1]!.at) {
      lo = STOPS[i]!;
      hi = STOPS[i + 1]!;
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = (v - lo.at) / span;
  const r = Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t);
  const g = Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t);
  const b = Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t);
  const a = lo.alpha + (hi.alpha - lo.alpha) * t;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function ZoneBlobs({ grid, zoneX, colY }: { grid: number[]; zoneX: number[]; colY: number[] }) {
  return (
    <>
      {zoneX.map((cx, row) =>
        colY.map((cy, col) => {
          const v = grid[row * COLS + col] ?? 0;
          if (v <= 2) return null;
          const r = 42 + (v / 100) * 46;
          return <circle key={`${row}-${col}`} cx={cx} cy={cy} r={r} fill={heatFill(v)} />;
        })
      )}
    </>
  );
}

/**
 * Isı haritasını matplotlib contour tarzına yakın, yumuşak geçişli blob'lar olarak
 * çizer (gaussian blur filtresiyle harmanlanmış daireler) — sert köşeli grid hücreleri yerine.
 */
export default function HeatmapPitch({ homeGrid, awayGrid, homeName, awayName }: HeatmapPitchProps) {
  const { t } = useTranslation('match');
  const home = clampGrid(homeGrid);
  const away = clampGrid(awayGrid);

  return (
    <div className={styles.wrap}>
      <div className={styles.teamBar}>
        <span className={styles.teamBarName}>{homeName}</span>
        <span className={styles.teamBarName}>{awayName}</span>
      </div>

      <div className={styles.pitch}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t('heatmapLabel')}
        >
          <defs>
            <filter id="heatBlur" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="16" />
            </filter>
          </defs>

          {/* Yumuşak ısı blob'ları */}
          <g filter="url(#heatBlur)">
            <ZoneBlobs grid={home} zoneX={HOME_ZONE_X} colY={HOME_COL_Y} />
            <ZoneBlobs grid={away} zoneX={AWAY_ZONE_X} colY={AWAY_COL_Y} />
          </g>

          {/* Saha çizgileri — blur'un üzerinde, keskin */}
          <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
            <rect x={MARGIN} y={MARGIN} width={VB_W - MARGIN * 2} height={VB_H - MARGIN * 2} />
            <line x1={HALF_LINE_X} y1={MARGIN} x2={HALF_LINE_X} y2={VB_H - MARGIN} />
            <circle cx={HALF_LINE_X} cy={VB_H / 2} r="45" />
            <rect x={MARGIN} y={VB_H / 2 - 92} width="58" height="184" />
            <rect x={VB_W - MARGIN - 58} y={VB_H / 2 - 92} width="58" height="184" />
          </g>
        </svg>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendLabel}>{t('heatmapLow')}</span>
        <span className={styles.legendGradient} />
        <span className={styles.legendLabel}>{t('heatmapHigh')}</span>
      </div>
    </div>
  );
}
