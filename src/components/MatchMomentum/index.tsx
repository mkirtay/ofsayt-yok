import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from '@/lib/i18n';
import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';
import type { MatchMomentumResponse } from '@/services/sportmonks/momentum';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import styles from './matchMomentum.module.scss';

/**
 * Genel Bakış üstünde momentum (baskı) şeridi: dakika başına ev − deplasman baskısı (bkz. services/sportmonks/momentum.ts),
 * ev üstte / deplasman altta (MatchStats çubuklarıyla aynı renkler), gol + kırmızı kart işaretleri, devre ayırıcı, dokunmatik /
 * hover ipucu. Veri istemciden (`/api/matches/[id]/momentum`); SSR'a girmez.
 *
 * Yer: başlamış / bitmiş maçta kart yüksekliği ilk HTML'de ayrılır (iskelet; CLS yok). Veri gelmezse (204 / hata) kart
 * kaldırılır — kapsadığımız liglerin hepsinde trend verisi var (2026-10-21: SL, 1. Lig), bu nadir. Maç öncesinde hiç yok.
 */

const CHART_W = 1000;
const CHART_H = 64;
const MID = CHART_H / 2;
/** Devreler arası boşluk (viewBox birimi). */
const GAP = 12;
const LIVE_POLL_MS = 60_000;

const GOAL_EVENTS = new Set(['GOAL', 'PENALTY', 'OWN_GOAL']);
const RED_EVENTS = new Set(['RED_CARD', 'YELLOW_RED_CARD']);

type Props = {
  matchId: string;
  match: Match | null | undefined;
  events: MatchEvent[];
};

type Marker = { key: number; x: number; home: boolean; kind: 'goal' | 'red'; label: string };

type Layout = { x0: number; unit: number }[];

function layoutSegments(data: MatchMomentumResponse): Layout {
  const total = data.segments.reduce((s, g) => s + g.length, 0);
  const unit = (CHART_W - GAP * (data.segments.length - 1)) / Math.max(1, total);
  let x = 0;
  return data.segments.map((g) => {
    const out = { x0: x, unit };
    x += g.length * unit + GAP;
    return out;
  });
}

/** Maç dakikası → devre + devre içi ofset (olaylar `minute`, uzatma dakikası olmadan). */
function minuteToX(minute: number, data: MatchMomentumResponse, layout: Layout): number {
  let seg = 0;
  for (let i = 0; i < data.segments.length; i++) if (minute > data.segments[i]!.from || i === 0) seg = i;
  const g = data.segments[seg]!;
  const offset = Math.min(Math.max(0, minute - g.from), g.length - 0.5);
  return layout[seg]!.x0 + offset * layout[seg]!.unit;
}

function areaPath(data: MatchMomentumResponse, layout: Layout, sign: 1 | -1): string {
  const parts: string[] = [];
  data.segments.forEach((g, s) => {
    if (g.played === 0) return;
    const { x0, unit } = layout[s]!;
    const y = (v: number) => (MID - (Math.max(0, v * sign) / 100) * (MID - 2) * sign).toFixed(1);
    let d = `M${x0.toFixed(1)} ${MID}`;
    for (let i = 0; i < g.played; i++) d += `L${(x0 + (i + 0.5) * unit).toFixed(1)} ${y(data.points[g.start + i]!)}`;
    d += `L${(x0 + g.played * unit).toFixed(1)} ${MID}Z`;
    parts.push(d);
  });
  return parts.join('');
}

export default function MatchMomentum({ matchId, match, events }: Props) {
  const { t } = useTranslation('match');
  const display = match ? matchDisplayState(match) : null;
  const started =
    !!display && display.phase !== 'PRE' && (!display.special || specialKeepsData(display.special));
  const [data, setData] = useState<MatchMomentumResponse | null | undefined>(undefined);
  const live = display?.phase === 'LIVE' || display?.phase === 'HT';

  useEffect(() => {
    if (!started || !matchId) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/momentum`, { signal: ctrl.signal });
        if (cancelled) return;
        if (res.status === 200) setData((await res.json()) as MatchMomentumResponse);
        // 204 = veri yok; hata: önceki veri varsa (canlı yoklama) korunur, yoksa kart kaldırılır.
        else setData((prev) => (res.status === 204 ? null : (prev ?? null)));
      } catch {
        if (!cancelled && !ctrl.signal.aborted) setData((prev) => prev ?? null);
      }
    };
    void load();
    const timer = live ? window.setInterval(load, LIVE_POLL_MS) : undefined;
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [matchId, started, live]);

  if (!started || data === null) return null;
  if (data === undefined) {
    return (
      <section className={styles.card} aria-busy="true" aria-label={t('momentum.title')}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('momentum.title')}</h3>
        </div>
        <div className={styles.chart}>
          <div className={styles.skeleton} />
        </div>
        <div className={styles.axis} />
      </section>
    );
  }
  return <MomentumChart data={data} homeName={match?.home?.name ?? ''} awayName={match?.away?.name ?? ''} events={events} />;
}

/** Forma renkleri (yoksa CSS token'ları kalır); kenar rengi temaya göre CSS'te seçilir. */
function teamColorVars(data: MatchMomentumResponse): CSSProperties | undefined {
  const c = data.colors;
  if (!c) return undefined;
  const vars: Record<string, string> = { '--mm-home': c.home.fill, '--mm-away': c.away.fill };
  if (c.home.edge.light) vars['--mm-home-edge-l'] = c.home.edge.light;
  if (c.home.edge.dark) vars['--mm-home-edge-d'] = c.home.edge.dark;
  if (c.away.edge.light) vars['--mm-away-edge-l'] = c.away.edge.light;
  if (c.away.edge.dark) vars['--mm-away-edge-d'] = c.away.edge.dark;
  return vars as CSSProperties;
}

type ChartProps = { data: MatchMomentumResponse; homeName: string; awayName: string; events: MatchEvent[] };

/** Dolu kart (veri hazır). */
export function MomentumChart({ data, homeName, awayName, events }: ChartProps) {
  const { t } = useTranslation('match');
  const [hover, setHover] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutSegments(data), [data]);
  const markers = useMemo<Marker[]>(
    () =>
      events
        .filter((e) => GOAL_EVENTS.has(e.event) || RED_EVENTS.has(e.event))
        .map((e) => ({
          key: e.id,
          x: minuteToX(e.time, data, layout),
          home: e.is_home,
          kind: GOAL_EVENTS.has(e.event) ? ('goal' as const) : ('red' as const),
          label: `${e.time}' ${GOAL_EVENTS.has(e.event) ? t('momentum.goal') : t('momentum.redCard')} · ${e.player?.name ?? ''}`.trim(),
        })),
    [data, layout, events, t],
  );

  // İpucu: imlecin altındaki dakika (devre ofseti → maç dakikası; 0. dakika "1'").
  const hoverInfo = (() => {
    if (hover == null) return null;
    for (let s = 0; s < data.segments.length; s++) {
      const g = data.segments[s]!;
      const { x0, unit } = layout[s]!;
      if (hover < x0 || hover > x0 + g.length * unit) continue;
      const i = Math.min(g.played - 1, Math.floor((hover - x0) / unit));
      if (i < 0) return null;
      const v = data.points[g.start + i]!;
      const minute = g.from + Math.max(1, i);
      const text = Math.abs(v) < 15 ? t('momentum.balanced') : t('momentum.pressure', { team: v > 0 ? homeName : awayName });
      return { x: x0 + (i + 0.5) * unit, text: `${minute}' · ${text}`, side: v >= 0 ? 'home' : 'away' };
    }
    return null;
  })();

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setHover(((e.clientX - rect.left) / rect.width) * CHART_W);
  };

  const pct = (x: number) => `${(x / CHART_W) * 100}%`;
  const ticks = data.segments.flatMap((g, s) => {
    const { x0, unit } = layout[s]!;
    const end = g.from + (g.from < 90 ? 45 : 15);
    return s === 0 ? [{ x: x0, label: "0'" }, { x: x0 + (end - g.from) * unit, label: `${end}'` }] : [{ x: x0 + (end - g.from) * unit, label: `${end}'` }];
  });

  return (
    <section className={styles.card} aria-label={t('momentum.title')} style={teamColorVars(data)}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('momentum.title')}</h3>
        {hoverInfo ? (
          // İmleç / parmak grafiğin üstündeyken lejantın yerinde o dakika (grafiği kapatmaz).
          <span className={`${styles.tip} ${hoverInfo.side === 'home' ? styles.tipHome : styles.tipAway}`} aria-hidden="true">
            {hoverInfo.text}
          </span>
        ) : (
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.legendHome}>{homeName}</span>
            <span className={styles.legendAway}>{awayName}</span>
          </div>
        )}
      </div>
      <div
        ref={chartRef}
        className={styles.chart}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        // Dokunmatikte parmak kalkınca ipucu kalır (okunabilsin); fare çıkınca kaybolur.
        onPointerLeave={(e) => (e.pointerType === 'mouse' ? setHover(null) : undefined)}
        role="img"
        aria-label={t('momentum.aria', { home: homeName, away: awayName })}
      >
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className={styles.svg} aria-hidden="true">
          {data.segments.map((g, s) => (
            <rect key={s} x={layout[s]!.x0} y={0} width={g.length * layout[s]!.unit} height={CHART_H} className={styles.band} />
          ))}
          <path d={areaPath(data, layout, 1)} className={styles.areaHome} vectorEffect="non-scaling-stroke" />
          <path d={areaPath(data, layout, -1)} className={styles.areaAway} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={CHART_W} y1={MID} y2={MID} className={styles.zero} vectorEffect="non-scaling-stroke" />
          {hoverInfo ? (
            <line x1={hoverInfo.x} x2={hoverInfo.x} y1={0} y2={CHART_H} className={styles.guide} vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {markers.map((m) => (
          <span
            key={m.key}
            className={`${styles.marker} ${m.home ? styles.markerHome : styles.markerAway} ${m.kind === 'goal' ? styles.goal : styles.red}`}
            style={{ left: pct(m.x) }}
            title={m.label}
          />
        ))}
      </div>
      <div className={styles.axis} aria-hidden="true">
        {ticks.map((tk) => (
          <span key={tk.label} style={{ left: pct(tk.x) }}>
            {tk.label}
          </span>
        ))}
      </div>
    </section>
  );
}
