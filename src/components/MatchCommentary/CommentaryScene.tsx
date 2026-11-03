import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import ScaledScene from '@/components/PitchScenes/ScaledScene';
import turf from '@/components/PitchScenes/turf.module.scss';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';
import { SCENE_H, SCENE_W, buildKickoffScene, lane } from './sceneLayout';
import { buildPlan, effectState, trailState, type ScenePlan, type ScriptEffect, type Vec } from './scenePlan';
import { SEPARATION, activeMove, createWorld, simulate, stepWorld, type World } from './sceneMotion';
import { nextRun, type SceneEvent, type SceneRun } from './sceneEvents';
import { DOT, validateScene } from './sceneRules';
import { sceneKits, shortName, surname, type DotColor } from './sceneKit';
import styles from './commentaryScene.module.scss';

export type CommentarySceneProps = {
  /** Oynatılacak sahne olayı (birleşmiş satırlar); `kickoff` modunda null. */
  event: SceneEvent | null;
  squads: SceneSquads | null;
  /** Maç başlamadan önceki bekleme sahnesi: diziliş + orta noktada top, olay yok. */
  kickoff?: boolean;
  /** Kullanıcı satıra her tıkladığında artar → seçilen sahne baştan oynar. */
  playToken?: number;
  /** Canlı takip (kullanıcı seçimi yok): yeni olay oynayan sahneyi kesmez, bitince geçer. */
  follow?: boolean;
};

/**
 * Anlatım satırının temsili 2D sahnesi (504×320, yukarıdan saha): olayın kısa pozisyon akışı (scenePlan.ts →
 * sceneMotion.ts) ya da maç öncesi bekleme dizilişi. Yalnız transform/opacity değişir (docs/animasyon-referans/README.md).
 * Konumlar GERÇEK DEĞİL: diziliş kadrodan, bölge metinden, gerisi olay kimliğinden belirlenimli. Sekme gizliyken / ekran
 * dışındayken durur, "hareketi azalt"ta olayın sonuç anı tek kare görünür.
 */
export default function CommentaryScene(props: CommentarySceneProps) {
  if (props.kickoff) return <KickoffScene squads={props.squads} />;
  return props.event ? <MiniMatch event={props.event} squads={props.squads} playToken={props.playToken} follow={props.follow} /> : null;
}

/** Bekleme sahnesi (maç öncesi) — CSS animasyonlu diziliş: noktalar nefes alır, top orta noktada, halka genişler. */
function KickoffScene({ squads }: { squads: SceneSquads | null }) {
  const { t } = useTranslation('match');
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const layout = useMemo(() => buildKickoffScene(squads), [squads]);
  return (
    <div className={`${styles.root} ${styles.idle}`} style={{ '--x2': layout.ball.x, '--y2': layout.ball.y } as React.CSSProperties} data-scene="kickoff">
      <ScaledScene height={SCENE_H} className={styles.stage}>
        <div ref={ref} className={`${turf.turf} ${styles.pitch}`} aria-hidden="true">
          <span className={turf.stripes} />
          <PitchLines />
          <span className={`${styles.goal} ${styles.goalL}`} />
          <span className={`${styles.goal} ${styles.goalR}`} />
          {layout.dots.map((dot, index) => (
            <span
              key={`${dot.side}-${dot.name || index}`}
              className={`${styles.dot} ${dot.side === 'home' ? styles.kitHome : styles.kitAway}`}
              style={{ '--x': dot.x, '--y': dot.y, '--i': index } as React.CSSProperties}
            />
          ))}
          <span className={styles.ring} />
          <span className={`${turf.ball} ${styles.ballPath}`} />
        </div>
      </ScaledScene>
      <p className={styles.note}>{t('commentary.scene.kickoffNote')}</p>
    </div>
  );
}

// ─── Mini maç ───

const translate = (x: number, y: number) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

const FX_CLASS: Record<ScriptEffect['kind'], string> = {
  goal: styles.fxGoal!,
  save: styles.fxRing!,
  block: styles.fxBurst!,
  post: styles.fxBurst!,
  whistle: styles.fxBubble!,
  flag: styles.fxFlag!,
  offsideLine: styles.fxLine!,
  card: styles.fxCard!,
  board: styles.fxBoard!,
};

function effectNode(e: ScriptEffect): ReactNode {
  if (e.kind === 'whistle')
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
        <path d="M2 7.5a4.5 4.5 0 1 0 8.6-1.9H15V3.4H6.2A4.5 4.5 0 0 0 2 7.5zm4.5-1.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z" />
      </svg>
    );
  if (e.kind === 'board')
    return (
      <>
        <span>▲</span>
        <b>▼</b>
      </>
    );
  return null;
}

const effectAt = (e: ScriptEffect) => (e.kind === 'offsideLine' ? translate(e.x, 0) : translate(e.at.x, e.at.y));
const curve = (tr: { kind: string }, from: Vec, to: Vec) => {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - (tr.kind === 'cross' ? 26 : 0) };
  return `M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
};

/** Dünyayı DOM'a yazar (yalnız transform/opacity/stroke) — React render'ı yok. */
function paint(root: HTMLElement, w: World) {
  const plan = w.plan;
  const layer = root.querySelector<HTMLElement>('[data-layer]');
  if (layer) layer.style.opacity = String(w.layerOpacity);
  root.querySelectorAll<HTMLElement>('[data-pl]').forEach((el) => {
    const i = Number(el.dataset.pl);
    const b = w.bodies[i];
    if (!b) return;
    el.style.transform = translate(b.pos.x, b.pos.y);
    el.style.opacity = String(b.opacity);
    const fall = plan.falls.find((f) => f.i === i);
    const dot = el.querySelector<HTMLElement>('[data-dot]');
    if (dot) dot.style.transform = fall && w.t >= fall.t && w.t < fall.t + 1100 ? 'scale(1.25, 0.55) rotate(25deg)' : '';
  });
  const ball = root.querySelector<HTMLElement>('[data-ball]');
  if (ball) {
    ball.style.transform = translate(w.ball.pos.x, w.ball.pos.y);
    ball.style.opacity = String(w.ball.opacity);
  }
  const lift = root.querySelector<HTMLElement>('[data-lift]');
  if (lift) lift.style.transform = `translateY(${(-w.ball.lift).toFixed(1)}px) scale(${(1 + w.ball.lift / 70).toFixed(3)})`;
  const t = Math.max(0, w.t);
  root.querySelectorAll<SVGPathElement>('[data-trail]').forEach((el) => {
    const k = Number(el.dataset.trail);
    const tr = plan.trails[k];
    if (!tr) return;
    const from = w.trailFrom[k];
    if (from && el.dataset.from !== '1') {
      el.setAttribute('d', curve(tr, from, tr.to));
      el.dataset.from = '1';
    }
    const st = trailState(tr, w.t < 0 ? -1 : t, plan.actionEndMs);
    el.style.opacity = String(st.opacity);
    el.style.strokeDashoffset = String(st.offset);
  });
  root.querySelectorAll<HTMLElement>('[data-fx]').forEach((el) => {
    const e = plan.effects[Number(el.dataset.fx)];
    if (!e) return;
    const st = effectState(e, w.t < 0 ? -1 : t, plan.actionEndMs);
    el.style.opacity = String(st.opacity);
    el.style.transform = `${effectAt(e)} scale(${st.scale.toFixed(3)})`;
  });
}

/** Geliştirme modu: denetim anında (şut, penaltı, korner ortası, ofsayt pası) kurallar — ihlal konsola. */
function devCheck(w: World, minute: number | null) {
  const p = w.plan;
  if (!p.check) return;
  const vis = p.agents.map((a, i) => ({ a, i })).filter(({ a, i }) => !a.referee && !a.sub && w.bodies[i]!.opacity > 0.5);
  const at = (i: number | null) => (i == null ? null : vis.findIndex((v) => v.i === i));
  const { violations } = validateScene(
    {
      bodies: vis.map(({ a, i }) => ({ side: a.side!, goalkeeper: a.goalkeeper, pos: w.bodies[i]!.pos, contact: !!activeMove(p.moves, i, w.t)?.contact || i === w.presser || i === w.ball.owner })),
      ball: w.ball.pos,
      attack: p.side,
      geo: lane(p.side, p.flip),
      phase: p.check.phase,
      shooter: at(p.check.shooter),
      offsider: at(p.check.offsider),
      expected: p.expected,
      lateGame: (minute ?? 0) >= 88,
      minGap: DOT - 1,
    },
    { fix: false },
  );
  if (violations.length) console.warn(`[sahne] ${minute ?? '?'}′ ${p.type}: kural ihlali`, violations);
}

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Olay sahnesi: plan (scenePlan.ts) → hareket durumu (sceneMotion.ts) → çizim (paint). Bileşen olaylar arasında kalıcıdır:
 * oyuncular kaldıkları yerden yeni pozisyona geçer; aynı olay (aynı anahtar + imza) yeniden gelirse sahne sıfırlanmaz.
 * `follow` (canlı, seçim yok): yeni olay o an oynayan sahneyi kesmez, bitince geçer (kuyruk yok, yalnız en yeni).
 * Kullanıcı seçimi (`playToken`) hemen oynar; eski döngü/sayaçlar tek rAF döngüsünde kalır, unmount'ta temizlenir.
 * "Hareketi azalt": olayın sonuç anı tek kare olarak çizilir.
 */
function MiniMatch({ event, squads, playToken = 0, follow = false }: { event: SceneEvent; squads: SceneSquads | null; playToken?: number; follow?: boolean }) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const [run, setRun] = useState<SceneRun>({ event, n: 0 });
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const speedRef = useRef<number>(1);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const gapRef = useRef(SEPARATION);
  const checkedRef = useRef(false);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const kits = useMemo(() => sceneKits(squads), [squads]);
  const worldRef = useRef<World | null>(null);
  const pendingRef = useRef<SceneEvent | null>(null);
  const tokenRef = useRef(playToken);
  const loopRef = useRef<{ start: () => void } | null>(null);

  // Gelen olay → oynatma kararı.
  useEffect(() => {
    const replay = playToken !== tokenRef.current;
    tokenRef.current = playToken;
    setRun((cur) => {
      const w = worldRef.current;
      const busy = !!w && w.t < w.plan.actionEndMs + 600 && !w.resting;
      const next = nextRun(cur, event, { replay, follow, busy });
      pendingRef.current = next.pending;
      return next.run;
    });
    loopRef.current?.start();
  }, [event, playToken, follow]);

  const plan = useMemo<ScenePlan | null>(
    () => buildPlan(run.event.item, squads, { seed: run.event.id, disallowed: run.event.disallowed }),
    [run.event, squads],
  );
  const minuteRef = useRef<number | null>(null);

  // Tek rAF döngüsü: dünyayı geçen zamanla ilerletir; duraklatılmışken / dinlenirken durur.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let raf = 0;
    let last: number | null = null;
    const paused = () => root.hasAttribute('data-motion-paused');
    const tick = (now: number) => {
      raf = 0;
      const w = worldRef.current;
      if (!w || paused() || reducedMotion()) {
        last = null;
        return;
      }
      const dt = last == null ? 16 : now - last;
      last = now;
      stepWorld(w, dt * speedRef.current);
      paint(root, w);
      if (process.env.NODE_ENV !== 'production' && !checkedRef.current && w.plan.check && w.t >= w.plan.check.t) {
        checkedRef.current = true;
        devCheck(w, minuteRef.current);
      }
      const pending = pendingRef.current;
      if (pending && (w.t >= w.plan.actionEndMs + 600 || w.resting)) {
        pendingRef.current = null;
        setRun((cur) => ({ event: pending, n: cur.n + 1 }));
        return;
      }
      if (!w.resting) raf = requestAnimationFrame(tick);
      else last = null;
    };
    const start = () => {
      if (!raf && !paused() && !reducedMotion()) raf = requestAnimationFrame(tick);
    };
    loopRef.current = { start };
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => (paused() ? (cancelAnimationFrame(raf), (raf = 0), (last = null)) : start())) : null;
    mo?.observe(root, { attributes: true, attributeFilter: ['data-motion-paused'] });
    if (worldRef.current && !worldRef.current.resting) start();
    return () => {
      mo?.disconnect();
      cancelAnimationFrame(raf);
      loopRef.current = null;
    };
  }, []);

  // Yeni plan / yeniden oynatma: dünya önceki durumdan devam eder.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !plan) return;
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
      const w = simulate(plan, plan.climaxMs + 700);
      worldRef.current = w;
      paint(root, w);
      return;
    }
    const w = createWorld(plan, worldRef.current);
    w.gap = gapRef.current;
    worldRef.current = w;
    checkedRef.current = false;
    minuteRef.current = run.event.item.minute;
    paint(root, w);
    loopRef.current?.start();
  }, [plan, run.n, run.event.item.minute]);

  // Dar ekranda noktalar okunur boyda kalır (CSS --inv ile büyür): ayrıştırma mesafesi de o oranda artar.
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver !== 'function') return;
    const fit = () => {
      const scale = root.clientWidth > 0 ? root.getBoundingClientRect().width / SCENE_W : 1;
      const inv = scale > 0 ? Math.min(1.6, Math.max(1, 1 / scale)) : 1;
      gapRef.current = SEPARATION * (1 + (inv - 1) * 0.6);
      if (worldRef.current) worldRef.current.gap = gapRef.current;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    fit();
    return () => ro.disconnect();
  }, []);

  // Dokunuşta en yakın oyuncunun adı ve numarası (2,5 sn).
  const onTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const root = ref.current;
    const w = worldRef.current;
    if (!root || !w) return;
    const rect = root.getBoundingClientRect();
    const k = rect.width / SCENE_W;
    const x = (e.clientX - rect.left) / k;
    const y = (e.clientY - rect.top) / k;
    let best = -1;
    let bestD = 22;
    w.plan.agents.forEach((a, i) => {
      if (a.referee || (a.sub && w.bodies[i]!.opacity < 0.5) || !a.name) return;
      const d = Math.hypot(w.bodies[i]!.pos.x - x, w.bodies[i]!.pos.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setTip(best >= 0 ? { i: best, x: w.bodies[best]!.pos.x, y: w.bodies[best]!.pos.y } : null);
  }, []);
  useEffect(() => {
    if (!tip) return;
    const id = window.setTimeout(() => setTip(null), 2500);
    return () => window.clearTimeout(id);
  }, [tip]);

  if (!plan) return null;
  const item = run.event.item;
  const baseKind = plan.disallowed ? t('commentary.scene.disallowed') : plan.type === 'card_red' ? t('commentary.kinds.redCard') : t(`commentary.kinds.${item.kind}`);
  const kindLabel = plan.penalty && item.kind !== 'penalty' ? `${t('commentary.kinds.penalty')} – ${baseKind}` : baseKind;
  const minute = item.minute != null ? `${item.minute}${item.extraMinute ? `+${item.extraMinute}` : ''}'` : '';
  const lead = plan.lead ? `${shortName(plan.lead.name)}${plan.lead.number != null ? ` (${plan.lead.number})` : ''}` : null;
  const title = [minute, kindLabel, lead].filter(Boolean).join(' · ');
  const start = plan.start;
  const color = (a: ScenePlan['agents'][number]): DotColor => {
    const side = a.side ?? 'home';
    return a.goalkeeper ? kits[side].keeper : kits[side].outfield;
  };
  const dotStyle = (c: DotColor) => ({ '--kit': c.fill, '--kit-text': c.text, '--kit-edge': c.edge }) as CSSProperties;
  const tipAgent = tip ? plan.agents[tip.i] : null;

  return (
    <div className={styles.root} data-scene={item.scene.type}>
      <div className={styles.bar}>
        <p className={styles.title}>{title}</p>
        {squads ? (
          <ul className={styles.legend} aria-label={t('commentary.scene.legend')}>
            {(['home', 'away'] as const).map((side) => (
              <li key={side}>
                <span className={styles.swatch} style={dotStyle(kits[side].outfield)} aria-hidden="true" />
                {squads[side].name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <ScaledScene height={SCENE_H} className={styles.stage}>
        <div ref={ref} className={`${turf.turf} ${styles.pitch}`} aria-hidden="true" onClick={onTap}>
          <span className={turf.stripes} />
          <PitchLines />
          <span className={`${styles.goal} ${styles.goalL}`} />
          <span className={`${styles.goal} ${styles.goalR}`} />

          <div data-layer className={styles.layer}>
            <svg key={`tr-${run.n}`} className={styles.trails} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} width={SCENE_W} height={SCENE_H}>
              {plan.trails.map((tr, i) => (
                <path
                  key={i}
                  data-trail={i}
                  pathLength={1}
                  className={`${styles.trail} ${tr.kind === 'shot' ? styles.trailShot : ''} ${tr.kind === 'cross' ? styles.trailCross : ''}`}
                  d={curve(tr, tr.from, tr.to)}
                />
              ))}
            </svg>

            {plan.agents.map((a, i) =>
              a.referee ? (
                <span key={a.key} data-pl={i} data-ref className={styles.ref} style={{ transform: translate(start.players[i]!.x, start.players[i]!.y) }}>
                  <span />
                </span>
              ) : (
                <span
                  key={a.key}
                  data-pl={i}
                  title={a.name ? `${a.number != null ? `${a.number} · ` : ''}${a.name}` : undefined}
                  className={[styles.pl, a.actor ? styles.plActor : ''].filter(Boolean).join(' ')}
                  style={{ transform: translate(start.players[i]!.x, start.players[i]!.y), opacity: a.sub && !plan.fades.some((f) => f.i === i) ? 0 : undefined }}
                >
                  <span className={styles.plBody}>
                    <span data-dot className={`${styles.plDot} ${a.goalkeeper ? styles.plKeeper : ''}`} style={dotStyle(color(a))}>
                      {a.number ?? ''}
                    </span>
                    {a.actor && a.name ? <span className={styles.plLabel}>{surname(a.name)}</span> : null}
                  </span>
                </span>
              ),
            )}

            <span data-ball className={styles.ballGround} style={start.ball ? { transform: translate(start.ball.x, start.ball.y) } : undefined}>
              <span className={styles.ballShadow} />
              <span data-lift className={styles.ballLift} />
            </span>
          </div>

          {plan.effects.map((e, i) => (
            <span
              key={`${run.n}-${i}`}
              data-fx={i}
              className={`${styles.fx} ${FX_CLASS[e.kind]} ${e.kind === 'card' ? (e.red ? styles.cardRed : styles.cardYellow) : ''}`}
              style={{ transform: effectAt(e) }}
            >
              {effectNode(e)}
            </span>
          ))}

          {tip && tipAgent ? (
            <span className={styles.tip} style={{ transform: translate(tip.x, tip.y) }}>
              <span>
                {tipAgent.number != null ? <b>{tipAgent.number}</b> : null}
                {tipAgent.name}
              </span>
            </span>
          ) : null}
        </div>
      </ScaledScene>
      <div className={styles.foot}>
        <p className={styles.note}>{t('commentary.scene.note')}</p>
        <div className={styles.controls}>
          <div className={styles.speed} role="group" aria-label={t('commentary.scene.speedLabel')}>
            {([1, 0.5] as const).map((v) => (
              <button key={v} type="button" aria-pressed={speed === v} className={speed === v ? styles.on : undefined} onClick={() => setSpeed(v)}>
                {v === 1 ? '1x' : locale === 'tr' ? '0,5x' : '0.5x'}
              </button>
            ))}
          </div>
          <button type="button" className={styles.replay} aria-label={t('commentary.scene.replayLabel')} onClick={() => setRun((cur) => ({ event: cur.event, n: cur.n + 1 }))}>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
            </svg>
            {t('commentary.scene.replay')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PitchLines() {
  return (
    <svg className={styles.lines} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} width={SCENE_W} height={SCENE_H} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2">
      <rect x="6" y="6" width={SCENE_W - 12} height={SCENE_H - 12} rx="2" />
      <path d={`M${SCENE_W / 2} 6V${SCENE_H - 6}`} />
      <circle cx={SCENE_W / 2} cy={SCENE_H / 2} r="44" />
      <rect x="6" y={SCENE_H / 2 - 95} width="79" height="190" />
      <rect x={SCENE_W - 85} y={SCENE_H / 2 - 95} width="79" height="190" />
      <rect x="6" y={SCENE_H / 2 - 43} width="26" height="86" />
      <rect x={SCENE_W - 32} y={SCENE_H / 2 - 43} width="26" height="86" />
      <circle cx="62" cy={SCENE_H / 2} r="1.5" fill="rgba(255,255,255,0.6)" />
      <circle cx={SCENE_W - 62} cy={SCENE_H / 2} r="1.5" fill="rgba(255,255,255,0.6)" />
      {/* Ceza sahası yayı (penaltı noktasından 44 px ≈ 9,15 m). */}
      <path d={`M85 ${SCENE_H / 2 - 37.4}A44 44 0 0 1 85 ${SCENE_H / 2 + 37.4}`} />
      <path d={`M${SCENE_W - 85} ${SCENE_H / 2 - 37.4}A44 44 0 0 0 ${SCENE_W - 85} ${SCENE_H / 2 + 37.4}`} />
    </svg>
  );
}
