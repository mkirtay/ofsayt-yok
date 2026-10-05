import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/frikik';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';
import { webglAvailable } from '@/components/pitch3d/webgl';
import { SHOTS_PER_SERIES, type ShotResult } from '@/lib/frikik/sim';
import { sharePath } from '@/lib/frikik/share';
import type { FrikikHandle, FrikikSummary } from './frikikScene';
import styles from './frikik.module.scss';

/** three.js sahnesi ayrı parça: sayfa yüklendikten sonra gelir (ilk yüke ve diğer sayfalara girmez). */
const loadScene = () => import('./frikikScene');

type Mode = 'boot' | 'reduced' | 'nowebgl' | 'game';
const TIP_SEEN_KEY = 'oy_frikik_tip';

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
}

/** Vuruş sonucunun kısa metni ("Doksan!", "Direkten gol", "Barajda kaldı" …). */
export function resultLabel(r: ShotResult, t: (key: string) => string): string {
  if (r.kind !== 'goal') return t(`result.${r.kind}`);
  return r.corner ? t('result.corner') : r.viaPost ? t('result.viaPost') : t('result.goal');
}

/**
 * /frikik oyunu: HUD (vuruş sayacı, puan, sonuç), tek seferlik ipucu, seri sonu kartı (tekrar oyna / paylaş) ve
 * sahnenin yüklenmesi.
 * Oyun döngüsü sahnede (frikikScene.ts); burası yalnız olayları gösterir. "Hareketi azalt" açıksa oyun kendiliğinden
 * başlamaz (statik bilgilendirme, isteyen açar). Alan sabit yükseklikte → CLS yok.
 */
export default function Frikik({ sharedScore }: { sharedScore: number | null }) {
  const { t } = useTranslation('frikik');
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FrikikHandle | null>(null);
  const [mode, setMode] = useState<Mode>('boot');
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<ShotResult[]>([]);
  const [total, setTotal] = useState(0);
  /** Tek seferlik "nasıl oynanır" ipucu (ilk açılışta; kapatılınca localStorage'a yazılır, bir daha çıkmaz). */
  const [tipOpen, setTipOpen] = useState(false);
  const [summary, setSummary] = useState<FrikikSummary | null>(null);
  const [shareNote, setShareNote] = useState('');
  const goalLabel = t('goal');
  const goalLabelRef = useRef(goalLabel);

  useEffect(() => {
    goalLabelRef.current = goalLabel;
    sceneRef.current?.setGoalLabel(goalLabel);
  }, [goalLabel]);

  // Karar: hareketi azalt → bilgilendirme; WebGL yok → mesaj; aksi halde oyun.
  useEffect(() => {
    const decide = () =>
      setMode(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : webglAvailable() ? 'game' : 'nowebgl');
    if (document.readyState === 'complete') decide();
    else {
      window.addEventListener('load', decide, { once: true });
      return () => window.removeEventListener('load', decide);
    }
  }, []);

  const startSeries = useCallback(() => {
    setSummary(null);
    setResults([]);
    setTotal(0);
    setRound(0);
    setShareNote('');
    sceneRef.current?.start(randomSeed());
  }, []);

  useEffect(() => {
    if (mode !== 'game') return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    loadScene().then(
      (mod) => {
        if (cancelled) return;
        try {
          sceneRef.current = mod.mountFrikik(host, {
            lite: window.matchMedia(MOBILE_LAYOUT_QUERY).matches,
            canvasClassName: styles.canvas!,
            handleClassName: styles.handle!,
            goalClassName: styles.goal!,
            trailClassName: styles.trail!,
            goalLabel: goalLabelRef.current,
            onRound: (i) => setRound(i),
            onShot: (_i, result, sum) => {
              setResults((prev) => [...prev, result]);
              setTotal(sum);
            },
            onFinish: (s) => setSummary(s),
            onAimStart: () => {},
          });
          setReady(true);
          startSeries();
          try {
            if (!localStorage.getItem(TIP_SEEN_KEY)) setTipOpen(true);
          } catch {
            // depolama kapalı: ipucu gösterilmez
          }
        } catch {
          setMode('nowebgl');
        }
      },
      () => setMode('nowebgl'),
    );
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, [mode, startSeries]);

  const closeTip = () => {
    setTipOpen(false);
    try {
      localStorage.setItem(TIP_SEEN_KEY, '1');
    } catch {
      // depolama kapalı: bu oturumda kapalı kalır
    }
  };

  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}${sharePath(summary.total)}`;
    const text = t('end.shareText', { score: summary.total });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Frikik', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareNote(t('end.copied'));
    } catch {
      // paylaşım iptal edildi / pano yok: sessiz
    }
  };

  const last = results[results.length - 1];
  const showToast = last != null && !summary;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.sub}>{t('sub')}</p>
      </div>
      {sharedScore != null ? <p className={styles.shared}>{t('shared', { score: sharedScore })}</p> : null}

      <div className={styles.stage} role="application" aria-label={t('stageLabel')}>
        <div ref={hostRef} className={styles.host} />

        {mode === 'game' ? (
          <>
            <div className={styles.hud}>
              <div className={styles.dots} aria-label={t('hud.shot', { n: Math.min(round + 1, SHOTS_PER_SERIES), total: SHOTS_PER_SERIES })}>
                {Array.from({ length: SHOTS_PER_SERIES }, (_, i) => {
                  const r = results[i];
                  const state = r ? (r.kind === 'goal' ? 'goal' : 'miss') : i === round && !summary ? 'current' : undefined;
                  return <span key={i} className={styles.dot} data-state={state} />;
                })}
              </div>
              <div className={styles.score}>{t('hud.score', { score: total })}</div>
            </div>
            {!ready ? <div className={styles.center}>{t('loading')}</div> : null}
            {showToast ? (
              <div key={results.length} className={styles.toast} data-goal={last.kind === 'goal' ? '' : undefined} role="status">
                {resultLabel(last, t)}
                {last.points > 0 ? ` ${t('result.points', { points: last.points })}` : ''}
              </div>
            ) : null}
          </>
        ) : null}

        {mode === 'nowebgl' ? <div className={styles.center}>{t('noWebgl')}</div> : null}

        {mode === 'reduced' ? (
          <div className={styles.overlay}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>{t('reduced.title')}</h2>
              <p className={styles.cardText}>{t('reduced.desc')}</p>
              <button type="button" className={styles.btn} onClick={() => setMode(webglAvailable() ? 'game' : 'nowebgl')}>
                {t('reduced.play')}
              </button>
            </div>
          </div>
        ) : null}

        {tipOpen && !summary ? (
          <div className={styles.overlay}>
            <div className={styles.card} role="dialog" aria-label={t('tip.title')}>
              <h2 className={styles.cardTitle}>{t('tip.title')}</h2>
              <ul className={`${styles.shotList} ${styles.tipList}`}>
                <li>{t('tip.l1')}</li>
                <li>{t('tip.l2')}</li>
                <li>{t('tip.l3')}</li>
              </ul>
              <button type="button" className={styles.btn} onClick={closeTip}>
                {t('tip.ok')}
              </button>
            </div>
          </div>
        ) : null}

        {summary ? (
          <div className={styles.overlay}>
            <div className={styles.card} role="dialog" aria-label={t('end.title')}>
              <h2 className={styles.cardTitle}>{t('end.title')}</h2>
              <p className={styles.cardScore}>{t('end.total', { score: summary.total })}</p>
              <ul className={styles.shotList}>
                {summary.results.map((r, i) => (
                  <li key={i}>
                    <span>
                      {i + 1}. {resultLabel(r, t)}
                    </span>
                    <span>{r.points > 0 ? t('result.points', { points: r.points }) : '0'}</span>
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                <button type="button" className={styles.btn} onClick={startSeries}>
                  {t('end.again')}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void share()}>
                  {t('end.share')}
                </button>
              </div>
              <p className={styles.note} role="status">
                {shareNote}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <section className={styles.rules}>
        <div>
          <h2>{t('rules.title')}</h2>
          <ol>
            <li>{t('rules.r1')}</li>
            <li>{t('rules.r2')}</li>
            <li>{t('rules.r3')}</li>
          </ol>
        </div>
        <div>
          <h2>{t('rules.scoring')}</h2>
          <ul>
            <li>{t('rules.p1')}</li>
            <li>{t('rules.p2')}</li>
            <li>{t('rules.p3')}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
