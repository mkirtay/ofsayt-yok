import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import ScaledScene from '@/components/PitchScenes/ScaledScene';
import turf from '@/components/PitchScenes/turf.module.scss';
import type { CommentaryItem } from '@/services/sportmonks/matchCommentary';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';
import { SCENE_H, SCENE_W, buildKickoffScene } from './sceneLayout';
import { buildScript, type SceneScript, type ScriptEffect, type Track } from './sceneScript';
import styles from './commentaryScene.module.scss';

export type CommentarySceneProps = {
  /** Oynatılacak anlatım satırı; `kickoff` modunda null. */
  item: CommentaryItem | null;
  squads: SceneSquads | null;
  /** Maç başlamadan önceki bekleme sahnesi: diziliş + orta noktada top, olay yok. */
  kickoff?: boolean;
};

/**
 * Anlatım satırının temsili 2D sahnesi (504×320, yukarıdan saha): olaya giden kısa bir "mini maç" (sceneScript.ts) ya da
 * maç öncesi bekleme dizilişi. Yalnız transform/opacity canlandırılır (docs/animasyon-referans/README.md). Konumlar GERÇEK
 * DEĞİL: diziliş kadrodan, bölge metinden, akış olay kimliğinden. Sekme gizliyken / ekran dışındayken durur, "hareketi
 * azalt"ta son kare görünür.
 */
export default function CommentaryScene(props: CommentarySceneProps) {
  if (props.kickoff) return <KickoffScene squads={props.squads} />;
  return props.item ? <MiniMatch item={props.item} squads={props.squads} /> : null;
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

const translate = (x: number, y: number) => `translate(${x}px, ${y}px)`;

/** İz → Web Animations karesi (0 ve 1 uçları dolu, ofsetler artan). */
function frames(track: Track, duration: number, value: (i: number) => Keyframe, easing = 'ease-in-out'): Keyframe[] {
  const out: Keyframe[] = [];
  track.t.forEach((t, i) => {
    const offset = Math.min(1, Math.max(0, t / duration));
    if (i === 0 && offset > 0) out.push({ ...value(0), offset: 0, easing });
    out.push({ ...value(i), offset, easing });
  });
  const last = track.t.length - 1;
  if (last >= 0 && (out.at(-1)?.offset ?? 1) < 1) out.push({ ...value(last), offset: 1 });
  return out;
}

/** Tek anlık efekt: `t` anında belirir, `hold` ms durur (son efektler sona kadar). */
function pop(t: number, duration: number, transform: string, hold = Infinity): Keyframe[] {
  const on = Math.min(1, t / duration);
  const peak = Math.min(1, (t + 180) / duration);
  const k: Keyframe[] = [
    { offset: 0, opacity: 0, transform: `${transform} scale(0.4)` },
    { offset: on, opacity: 0, transform: `${transform} scale(0.4)` },
    { offset: peak, opacity: 1, transform: `${transform} scale(1.15)` },
  ];
  if (hold !== Infinity && (t + hold) / duration < 1) {
    k.push({ offset: Math.min(1, (t + 180 + hold) / duration), opacity: 1, transform: `${transform} scale(1)` });
    k.push({ offset: Math.min(1, (t + 480 + hold) / duration), opacity: 0, transform: `${transform} scale(1)` });
    k.push({ offset: 1, opacity: 0, transform: `${transform} scale(1)` });
  } else k.push({ offset: 1, opacity: 1, transform: `${transform} scale(1)` });
  return k;
}

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

/**
 * Olay satırının mini maçı: oyuncular ve top `buildScript` izleriyle Web Animations üzerinden oynar (yalnız transform +
 * opacity, ana iş parçacığını yormaz). WAAPI yoksa ya da "hareketi azalt" açıksa son kare durur. Ekran dışında / sekme
 * arka plandayken `useMotionPause` özniteliğiyle duraklar.
 */
function MiniMatch({ item, squads }: { item: CommentaryItem; squads: SceneSquads | null }) {
  const { t } = useTranslation('match');
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const script = useMemo<SceneScript | null>(() => buildScript(item, squads), [item, squads]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !script || typeof root.animate !== 'function') return;
    const D = script.durationMs;
    const anims: Animation[] = [];
    const run = (el: Element | null | undefined, k: Keyframe[], opts: KeyframeAnimationOptions = {}) => {
      if (el instanceof HTMLElement || el instanceof SVGElement) anims.push(el.animate(k, { duration: D, fill: 'both', ...opts }));
    };
    const q = (sel: string) => Array.from(root.querySelectorAll(sel));

    q('[data-pl]').forEach((el) => {
      const p = script.players[Number(el.getAttribute('data-pl'))];
      if (!p) return;
      run(el, frames(p.track, D, (i) => ({ transform: translate(p.track.p[i]!.x, p.track.p[i]!.y) })));
      if (p.fallAt != null) {
        const a = Math.min(1, p.fallAt / D);
        run(el.firstElementChild, [
          { offset: 0, transform: 'scale(1)' },
          { offset: a, transform: 'scale(1)' },
          { offset: Math.min(1, a + 120 / D), transform: 'scale(1.25, 0.55) rotate(25deg)' },
          { offset: Math.min(1, a + 900 / D), transform: 'scale(1.25, 0.55) rotate(25deg)' },
          { offset: Math.min(1, a + 1100 / D), transform: 'scale(1)' },
          { offset: 1, transform: 'scale(1)' },
        ]);
      }
    });
    run(root.querySelector('[data-ref]'), frames(script.referee, D, (i) => ({ transform: translate(script.referee.p[i]!.x, script.referee.p[i]!.y) })));
    const bt = script.ball.track;
    run(root.querySelector('[data-ball]'), frames(bt, D, (i) => ({ transform: translate(bt.p[i]!.x, bt.p[i]!.y) }), 'linear'));
    run(
      root.querySelector('[data-lift]'),
      frames(bt, D, (i) => {
        const h = script.ball.lift[i] ?? 0;
        return { transform: `translateY(${-h}px) scale(${1 + h / 70})` };
      }),
    );
    q('[data-trail]').forEach((el) => {
      const tr = script.trails[Number(el.getAttribute('data-trail'))];
      if (!tr) return;
      const a = tr.t0 / D;
      const b = Math.min(1, tr.t1 / D);
      const c = Math.min(1, (tr.t1 + 900) / D);
      const k: Keyframe[] = [
        { offset: 0, opacity: 0, strokeDashoffset: 1 },
        { offset: a, opacity: 0.9, strokeDashoffset: 1 },
        { offset: b, opacity: 0.9, strokeDashoffset: 0 },
      ];
      if (c < 1) k.push({ offset: c, opacity: 0, strokeDashoffset: 0 });
      k.push({ offset: 1, opacity: tr.kind === 'shot' ? 0.9 : 0, strokeDashoffset: 0 });
      run(el, k);
    });
    q('[data-fx]').forEach((el) => {
      const e = script.effects[Number(el.getAttribute('data-fx'))];
      if (!e) return;
      const hold = e.kind === 'whistle' || e.kind === 'block' || e.kind === 'post' ? 700 : Infinity;
      run(el, pop(e.t, D, effectAt(e), hold));
    });
    const cap = root.querySelector('[data-caption]');
    const climax = script.effects.find((e) => e.kind !== 'offsideLine' && e.kind !== 'board')?.t ?? D * 0.7;
    run(cap, [
      { offset: 0, opacity: 0 },
      { offset: Math.min(1, climax / D), opacity: 0 },
      { offset: Math.min(1, (climax + 200) / D), opacity: 1 },
      { offset: 1, opacity: 1 },
    ]);

    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      for (const a of anims) {
        a.currentTime = D;
        a.pause();
      }
    }
    // useMotionPause özniteliği CSS animasyonlarını durdurur; WAAPI için gözlemci.
    const sync = () => {
      const paused = root.hasAttribute('data-motion-paused');
      for (const a of anims) {
        if (paused && a.playState === 'running') a.pause();
        else if (!paused && !reduce && a.playState === 'paused') a.play();
      }
    };
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(sync) : null;
    mo?.observe(root, { attributes: true, attributeFilter: ['data-motion-paused'] });
    sync();
    return () => {
      mo?.disconnect();
      for (const a of anims) a.cancel();
    };
  }, [script]);

  if (!script) return null;
  const end = script.durationMs;
  const last = (tr: Track) => tr.p[tr.p.length - 1] ?? { x: 0, y: 0 };
  const ballEnd = last(script.ball.track);
  const kindLabel = t(`commentary.kinds.${item.kind}`);
  const minute = item.minute != null ? `${item.minute}${item.extraMinute ? `+${item.extraMinute}` : ''}'` : '';

  return (
    <div className={styles.root} data-scene={item.scene?.type}>
      <ScaledScene height={SCENE_H} className={styles.stage}>
        <div ref={ref} className={`${turf.turf} ${styles.pitch}`} aria-hidden="true">
          <span className={turf.stripes} />
          <PitchLines />
          <span className={`${styles.goal} ${styles.goalL}`} />
          <span className={`${styles.goal} ${styles.goalR}`} />

          <svg className={styles.trails} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} width={SCENE_W} height={SCENE_H}>
            {script.trails.map((tr, i) => {
              const mid = { x: (tr.from.x + tr.to.x) / 2, y: (tr.from.y + tr.to.y) / 2 - (tr.kind === 'cross' ? 26 : 0) };
              return (
                <path
                  key={i}
                  data-trail={i}
                  pathLength={1}
                  className={`${styles.trail} ${tr.kind === 'shot' ? styles.trailShot : ''} ${tr.kind === 'cross' ? styles.trailCross : ''}`}
                  d={`M${tr.from.x} ${tr.from.y}Q${mid.x} ${mid.y} ${tr.to.x} ${tr.to.y}`}
                  style={tr.kind === 'shot' && tr.t1 <= end ? { opacity: 0.9, strokeDashoffset: 0 } : undefined}
                />
              );
            })}
          </svg>

          {script.players.map((p, i) => {
            const at = last(p.track);
            return (
              <span
                key={`${p.side}-${p.name || i}-${i}`}
                data-pl={i}
                className={[styles.pl, p.actor ? styles.plActor : '', p.goingOff ? styles.plOff : ''].filter(Boolean).join(' ')}
                style={{ transform: translate(at.x, at.y) }}
              >
                <span className={`${styles.plDot} ${p.side === 'home' ? styles.kitHome : styles.kitAway}`} />
              </span>
            );
          })}
          <span data-ref className={styles.ref} style={{ transform: translate(last(script.referee).x, last(script.referee).y) }}>
            <span />
          </span>

          <span data-ball className={styles.ballGround} style={{ transform: translate(ballEnd.x, ballEnd.y) }}>
            <span className={styles.ballShadow} />
            <span data-lift className={styles.ballLift} />
          </span>

          {script.effects.map((e, i) => (
            <span
              key={i}
              data-fx={i}
              className={`${styles.fx} ${FX_CLASS[e.kind]} ${e.kind === 'card' ? (e.red ? styles.cardRed : styles.cardYellow) : ''}`}
              style={{ transform: effectAt(e), opacity: e.kind === 'whistle' || e.kind === 'block' || e.kind === 'post' ? 0 : 1 }}
            >
              {effectNode(e)}
            </span>
          ))}

          <span data-caption className={styles.caption} style={{ opacity: 1 }}>
            {minute ? `${minute} · ` : ''}
            {kindLabel}
          </span>
        </div>
      </ScaledScene>
      <p className={styles.note}>{t('commentary.scene.note')}</p>
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
    </svg>
  );
}
