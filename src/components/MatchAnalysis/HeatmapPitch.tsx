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

// viewBox koordinatları
const VB_W = 400;
const VB_H = 600;
const HALF_LINE_Y = VB_H / 2;
const MARGIN = 10;

const COL_X = [48, 124, 200, 276, 352];
// Ev sahibi: bölge 0 (savunma) kendi kalesine (üst kenar) yakın, bölge 2 (hücum) orta çizgiye yakın.
const HOME_ROW_Y = [68, 172, 262];
// Deplasman: kendi kalesi alt kenarda — bölge 0 alt kenara yakın, bölge 2 orta çizgiye yakın.
const AWAY_ROW_Y = [532, 428, 338];

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

function ZoneBlobs({ grid, rowY }: { grid: number[]; rowY: number[] }) {
  return (
    <>
      {rowY.map((cy, row) =>
        COL_X.map((cx, col) => {
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
          aria-label="Isı haritası"
        >
          <defs>
            <filter id="heatBlur" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="16" />
            </filter>
          </defs>

          {/* Yumuşak ısı blob'ları */}
          <g filter="url(#heatBlur)">
            <ZoneBlobs grid={home} rowY={HOME_ROW_Y} />
            <ZoneBlobs grid={away} rowY={AWAY_ROW_Y} />
          </g>

          {/* Saha çizgileri — blur'un üzerinde, keskin */}
          <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
            <rect x={MARGIN} y={MARGIN} width={VB_W - MARGIN * 2} height={VB_H - MARGIN * 2} />
            <line x1={MARGIN} y1={HALF_LINE_Y} x2={VB_W - MARGIN} y2={HALF_LINE_Y} />
            <circle cx={VB_W / 2} cy={HALF_LINE_Y} r="45" />
            <rect x={VB_W / 2 - 92} y={MARGIN} width="184" height="58" />
            <rect x={VB_W / 2 - 92} y={VB_H - MARGIN - 58} width="184" height="58" />
          </g>
        </svg>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendLabel}>Düşük</span>
        <span className={styles.legendGradient} />
        <span className={styles.legendLabel}>Yoğun</span>
      </div>
    </div>
  );
}
