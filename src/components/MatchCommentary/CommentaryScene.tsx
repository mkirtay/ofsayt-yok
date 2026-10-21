import { useMemo, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import ScaledScene from '@/components/PitchScenes/ScaledScene';
import turf from '@/components/PitchScenes/turf.module.scss';
import type { CommentaryItem } from '@/services/sportmonks/matchCommentary';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';
import { BENCH_Y, SCENE_H, SCENE_W, buildKickoffScene, buildScene, drift, type SceneDot } from './sceneLayout';
import styles from './commentaryScene.module.scss';

export type CommentarySceneProps = {
  /** Oynatılacak anlatım satırı; `kickoff` modunda null. */
  item: CommentaryItem | null;
  squads: SceneSquads | null;
  /** Maç başlamadan önceki bekleme sahnesi: diziliş + orta noktada top, olay yok. */
  kickoff?: boolean;
};

/**
 * Anlatım satırının temsili 2D sahnesi (504×320, yukarıdan saha). Saf CSS + SVG; yalnız transform/opacity canlandırılır
 * (docs/animasyon-referans/README.md). Konumlar GERÇEK DEĞİL: oyuncular kadro dizilişinden, top metinden çıkarılan
 * bölgeden. Sekme gizliyken / ekran dışındayken durur, "hareketi azalt"ta son kare görünür.
 */
export default function CommentaryScene({ item, squads, kickoff = false }: CommentarySceneProps) {
  const { t } = useTranslation('match');
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const layout = useMemo(() => (kickoff ? buildKickoffScene(squads) : item ? buildScene(item, squads) : null), [item, squads, kickoff]);
  if (!layout) return null;

  const { ball } = layout;
  // Engele takılan vuruş geri döner: son kare topun durduğu nokta.
  const rest = ball && ball.rebound ? { x: ball.x1 + (ball.x2 - ball.x1) * 0.72, y: ball.y1 + (ball.y2 - ball.y1) * 0.72 } : null;

  const vars = {
    '--dur': `${layout.durationMs}ms`,
    ...(ball
      ? {
          '--x1': ball.x1,
          '--y1': ball.y1,
          '--x2': ball.x2,
          '--y2': ball.y2,
          '--fx': rest ? rest.x : ball.x2,
          '--fy': rest ? rest.y : ball.y2,
          '--arc': ball.arc,
        }
      : {}),
  } as React.CSSProperties;

  const dotMotion = (dot: SceneDot) => {
    if (kickoff) return { dx: 0, dy: 0 };
    if (dot.comingOn) return { dx: 0, dy: 46 };
    if (dot.goingOff) return { dx: 0, dy: BENCH_Y - dot.y };
    return drift(dot, ball);
  };

  return (
    <div className={`${styles.root} ${kickoff ? styles.idle : ''}`.trim()} style={vars} data-scene={kickoff ? 'kickoff' : item?.scene?.type}>
      <ScaledScene height={SCENE_H} className={styles.stage}>
        <div ref={ref} className={`${turf.turf} ${styles.pitch}`} aria-hidden="true">
          <span className={turf.stripes} />
          <svg className={styles.lines} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} width={SCENE_W} height={SCENE_H} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2">
            <rect x="6" y="6" width={SCENE_W - 12} height={SCENE_H - 12} rx="2" />
            <path d={`M${SCENE_W / 2} 6V${SCENE_H - 6}`} />
            <circle cx={SCENE_W / 2} cy={SCENE_H / 2} r="44" />
            <rect x="6" y={SCENE_H / 2 - 95} width="79" height="190" />
            <rect x={SCENE_W - 85} y={SCENE_H / 2 - 95} width="79" height="190" />
            <rect x="6" y={SCENE_H / 2 - 43} width="26" height="86" />
            <rect x={SCENE_W - 32} y={SCENE_H / 2 - 43} width="26" height="86" />
          </svg>
          <span className={`${styles.goal} ${styles.goalL}`} />
          <span className={`${styles.goal} ${styles.goalR}`} />

          {layout.dots.map((dot, index) => {
            const motion = dotMotion(dot);
            const classes = [
              styles.dot,
              dot.side === 'home' ? turf.home : turf.away,
              dot.actor ? styles.actor : '',
              dot.goingOff ? styles.goingOff : '',
              dot.comingOn ? styles.comingOn : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <span
                key={`${dot.side}-${dot.name || index}`}
                className={classes}
                style={{ '--x': dot.x, '--y': dot.y, '--dx': motion.dx, '--dy': motion.dy, '--i': index } as React.CSSProperties}
              />
            );
          })}

          {kickoff ? <span className={styles.ring} /> : null}

          {ball ? (
            <span className={styles.ballPath}>
              <span className={`${turf.ball} ${styles.ballArc}`} />
            </span>
          ) : null}

          {layout.save ? <span className={styles.save} style={{ '--x': layout.save.x, '--y': layout.save.y } as React.CSSProperties} /> : null}
          {layout.goalFlash ? (
            <span className={styles.flash} style={{ '--x': layout.goalFlash.x, '--y': layout.goalFlash.y } as React.CSSProperties} />
          ) : null}
          {layout.card ? (
            <span
              className={`${styles.card} ${layout.card.red ? styles.cardRed : styles.cardYellow}`}
              style={{ '--x': layout.card.x, '--y': layout.card.y } as React.CSSProperties}
            />
          ) : null}
        </div>
      </ScaledScene>
      <p className={styles.note}>{t(kickoff ? 'commentary.scene.kickoffNote' : 'commentary.scene.note')}</p>
    </div>
  );
}
