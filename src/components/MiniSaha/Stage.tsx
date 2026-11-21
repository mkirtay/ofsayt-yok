import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/miniSaha';
import { CHARACTERS, CHAR_IDS, type CharId } from '@/lib/miniSaha/characters';
import { TICK_HZ, createWorld, secondsLeft, stepWorld, type Difficulty, type GameEvent, type Mode, type Team, type World } from '@/lib/miniSaha/engine';
import type { MatchSummary } from '@/lib/miniSaha/progress';
import type { OnlineClient } from './online';
import OnlinePanel from './OnlinePanel';
import { Portrait, loadTokens } from './Portrait';
import { buildStands, drawFrame, fitView, type Joy, type TokenImages, type View } from './render';
import styles from './miniSaha.module.scss';

export type StageOptions = { mode: Mode; diff: Difficulty; durSec: number; myChar: CharId };

type Hud = { score: [number, number]; left: number; golden: boolean };
type Overlay = { kind: 'pause' } | { kind: 'end'; score: [number, number]; unlocked: CharId[] | null } | null;

/** Frikik ile aynı işaret (components/Frikik GAME_ACTIVE_ATTR): yüzen düğmeler ve kartlar gizlenir. Frikik modülünü
 * buraya çekmemek için değer kopyalandı. */
const GAME_ACTIVE_ATTR = 'data-game-active';
const SOUND_KEY = 'oy_minisaha_sound';
const TICK_MS = 1000 / TICK_HZ;

/** Dik tutulan dokunmatik telefonda sahne 90° döndürülür (site telefonu yataya zorlayamaz; ekran kilidi açık olsa da çalışır). */
function useViewport() {
  const [vp, setVp] = useState(() => ({ w: typeof window === 'undefined' ? 0 : window.innerWidth, h: typeof window === 'undefined' ? 0 : window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}

/** Parmağı öğeye bağlar; bazı tarayıcılarda (ya da işaretçi çoktan bırakıldıysa) hata verir — yok sayılır. */
function capture(e: React.PointerEvent): void {
  try {
    (e.target as Element).setPointerCapture?.(e.pointerId);
  } catch {
    /* yakalama zorunlu değil */
  }
}

let audio: AudioContext | null = null;
function sfx(kind: 'kick' | 'goal', on: boolean) {
  if (!audio || !on) return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.connect(g);
  g.connect(audio.destination);
  if (kind === 'kick') {
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.start(t);
    o.stop(t + 0.12);
  } else {
    o.type = 'square';
    o.frequency.setValueAtTime(2300, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.setValueAtTime(0.05, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.32);
    g.gain.setValueAtTime(0.05, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.start(t);
    o.stop(t + 0.78);
  }
}

/**
 * Tam ekran oyun sahnesi (her zaman yatay). Döngü: requestAnimationFrame + 60 Hz sabit adım (engine.ts). HUD (skor,
 * süre), dokunmatik joystick + ŞUT düğmesi, klavye, duraklatma ve maç sonu kartı burada.
 */
export default function Stage({ opts, onFinish, onExit, online }: {
  opts: StageOptions;
  onFinish: (s: MatchSummary) => Promise<CharId[]>;
  onExit: () => void;
  /** Online maç: dünya sunucudan gelir (bkz. online.ts); duraklatma oyunu durdurmaz. */
  online?: OnlineClient | null;
}) {
  const { t } = useTranslation('miniSaha');
  const vp = useViewport();
  const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
  const rotated = touch && vp.h > vp.w;
  const stageW = rotated ? vp.h : vp.w;
  const stageH = rotated ? vp.w : vp.h;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const keys = useRef(new Set<string>());
  const joy = useRef<Joy & { id: number | null }>({ active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, R: 56 });
  const kickHeld = useRef(false);
  const paused = useRef(false);
  const spin = useRef(0);
  const [hud, setHud] = useState<Hud>({ score: [0, 0], left: opts.durSec, golden: false });
  /** Kısa bildirim (gol: golü atanın portresi + adı + GOL!; altın gol: yalnız metin). Sahayı kapatmaz, ~1,3 sn. */
  const [banner, setBanner] = useState<{ text: string; team: Team | null; charId: CharId | null; id: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [kickOn, setKickOn] = useState(false);
  /** Joystick kullanımda mı (değilse sol altta soluk ipucu gösterilir). */
  const [joyActive, setJoyActive] = useState(false);
  const [sound, setSound] = useState(true);
  const [round, setRound] = useState(0);
  const soundRef = useRef(true);
  /** Saha jetonları: sahne açılınca çözülür (lobide önceden indirildi); hazır olmayan karakter kodla çizilir. */
  const tokens = useRef<TokenImages>({});
  // online oda durumu (bekliyor / sayım / oyun / bitti / hata) — değişince yeniden çiz
  const onlineStatus = useSyncExternalStore(
    useCallback((cb: () => void) => (online ? online.subscribe(cb) : () => {}), [online]),
    () => online?.status ?? null,
    () => null,
  );
  const onlineState = onlineStatus?.kind === 'oda' ? onlineStatus.state : null;
  const rivalChar = onlineState ? onlineState.ch[onlineState.slot === 0 ? 1 : 0] : null;
  useEffect(() => loadTokens(CHAR_IDS, tokens.current), []);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SOUND_KEY) !== '0';
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kayıtlı ses tercihi yalnız istemcide
      setSound(s);
      soundRef.current = s;
    } catch {
      /* depolama kapalı */
    }
  }, []);

  // sahne açıkken: sayfa kaymaz, yüzen düğmeler gizlenir; Android'de tam ekran + yatay kilit denenir
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(GAME_ACTIVE_ATTR, '');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (touch && root.requestFullscreen) {
      root.requestFullscreen().then(
        () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {}),
        () => {},
      );
    }
    return () => {
      root.removeAttribute(GAME_ACTIVE_ATTR);
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [touch]);

  const pause = useCallback(() => {
    if (online) {
      // online: oyun durmaz (rakip oynuyor); yalnız menü açılır
      setOverlay((o) => (o ? o : { kind: 'pause' }));
      return;
    }
    const w = worldRef.current;
    if (!w || w.phase === 'end' || paused.current) return;
    paused.current = true;
    keys.current.clear();
    joy.current.active = false;
    joy.current.id = null;
    setJoyActive(false);
    kickHeld.current = false;
    setKickOn(false);
    setOverlay({ kind: 'pause' });
  }, [online]);

  // klavye
  useEffect(() => {
    const GAME = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX'];
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { pause(); return; }
      if (GAME.includes(e.code) && !paused.current) e.preventDefault();
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const vis = () => { if (document.hidden && !online) pause(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [pause, online]);

  // oyun döngüsü (her maç / rövanşta yeniden kurulur)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    // yerel maçta dünya burada; online maçta her karede sunucudan gelen görüntüden kurulur
    const local = online ? null : createWorld(opts);
    worldRef.current = local;
    paused.current = false;
    setOverlay(null);
    setBanner(null);
    setHud({ score: [0, 0], left: opts.durSec, golden: false });

    let view: View | null = null;
    let stands: HTMLCanvasElement | null = null;
    let sizeKey = '';
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastLeft = -1;
    let ended = false;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;

    const input = () => {
      const k = keys.current;
      const has = (...c: string[]) => c.some((x) => k.has(x));
      let x = Number(has('ArrowRight', 'KeyD')) - Number(has('ArrowLeft', 'KeyA'));
      let y = Number(has('ArrowDown', 'KeyS')) - Number(has('ArrowUp', 'KeyW'));
      const j = joy.current;
      if (j.active) {
        const dx = j.x - j.ox;
        const dy = j.y - j.oy;
        if (Math.hypot(dx, dy) / j.R > 0.12) { x = dx / j.R; y = dy / j.R; }
      }
      return { x, y, kick: has('Space', 'KeyX') || kickHeld.current };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // tuval boyutu (sahne boyutu değişince tribün yeniden çizilir)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = cv.parentElement!.getBoundingClientRect();
      const cw = Math.round((rotated ? rect.height : rect.width) * dpr);
      const ch = Math.round((rotated ? rect.width : rect.height) * dpr);
      const key = `${cw}x${ch}`;
      if (key !== sizeKey && cw > 0 && ch > 0) {
        sizeKey = key;
        cv.width = cw;
        cv.height = ch;
        view = fitView(cw, ch, dpr);
        stands = buildStands(view);
      }
      const dtMs = Math.min(250, now - last);
      last = now;
      const events: GameEvent[] = [];
      let w: World | null = local;
      if (online) {
        const prevBall = worldRef.current ? { x: worldRef.current.ball.x, y: worldRef.current.ball.y } : null;
        const r = online.frame(input());
        w = r.world;
        worldRef.current = w;
        if (w && prevBall) spin.current += Math.hypot(w.ball.x - prevBall.x, w.ball.y - prevBall.y);
        events.push(...r.events);
      } else if (local) {
        acc += dtMs;
        if (paused.current || ended) acc = 0;
        while (acc >= TICK_MS) {
          acc -= TICK_MS;
          const bx = local.ball.x;
          const by = local.ball.y;
          stepWorld(local, input());
          spin.current += Math.hypot(local.ball.x - bx, local.ball.y - by);
          events.push(...local.events);
          local.events.length = 0;
          if (local.phase === 'end') break;
        }
      }
      if (w) {
        const cur = w;
        for (const e of events) {
          if (e.type === 'kick') {
            sfx('kick', soundRef.current);
            if (e.human && navigator.vibrate) { try { navigator.vibrate(12); } catch { /* yok */ } }
          } else if (e.type === 'goal') {
            sfx('goal', soundRef.current);
            setHud((h) => ({ ...h, score: [cur.score[0], cur.score[1]] }));
            setBanner({
              text: e.scorer ? t(`chars.${e.scorer.c.id}.name`) : t('hud.ownGoal'),
              team: e.team,
              charId: e.scorer ? e.scorer.c.id : null,
              id: Date.now(),
            });
            clearTimeout(bannerTimer);
            bannerTimer = setTimeout(() => setBanner(null), 1300);
          } else if (e.type === 'golden') {
            setHud((h) => ({ ...h, golden: true }));
            setBanner({ text: t('hud.golden'), team: null, charId: null, id: Date.now() });
            clearTimeout(bannerTimer);
            bannerTimer = setTimeout(() => setBanner(null), 1300);
          } else if (e.type === 'end' && !ended && !online) {
            ended = true;
            const score: [number, number] = [cur.score[0], cur.score[1]];
            setOverlay({ kind: 'end', score, unlocked: null });
            void onFinish({ mode: opts.mode, diff: opts.diff, goalsFor: score[0], goalsAgainst: score[1] }).then((unlocked) =>
              setOverlay((o) => (o?.kind === 'end' ? { ...o, unlocked } : o)),
            );
          }
        }
        const left = secondsLeft(cur);
        if (left !== lastLeft) { lastLeft = left; setHud((h) => ({ ...h, left })); }
        // online: skor her görüntüyle gelir (gol olayı kaçsa da tabela doğru kalsın; değişmediyse yeniden çizim yok)
        if (online) {
          setHud((h) =>
            h.score[0] === cur.score[0] && h.score[1] === cur.score[1] && h.golden === cur.golden
              ? h
              : { ...h, score: [cur.score[0], cur.score[1]], golden: cur.golden },
          );
        }
        if (view) drawFrame(g, view, stands, cur, spin.current, joy.current, tokens.current);
      } else if (view) {
        // online: maç dünyası henüz yok (bekleme) — boş saha
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (stands) g.drawImage(stands, 0, 0);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(bannerTimer);
    };
    // opts sabit (sahne her maçta yeniden açılır); round rövanşı tetikler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, rotated]);

  // dokunmatik joystick: ekran koordinatı → sahne (dönükse 90°) koordinatı
  const toLocal = (cx: number, cy: number) => (rotated ? { x: cy, y: vp.w - cx } : { x: cx, y: cy });
  // joystick yalnız sahnenin sol yarısında başlar; merkezi dokunulan yerde SABİT kalır (parmak uzaklaşınca peşinden gelmez)
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || joy.current.id !== null || paused.current) return;
    const p = toLocal(e.clientX, e.clientY);
    if (p.x > stageW * 0.55) return;
    Object.assign(joy.current, { id: e.pointerId, active: true, ox: p.x, oy: p.y, x: p.x, y: p.y });
    setJoyActive(true);
    capture(e);
  };
  const onMove = (e: React.PointerEvent) => {
    const j = joy.current;
    if (e.pointerId !== j.id) return;
    const p = toLocal(e.clientX, e.clientY);
    let dx = p.x - j.ox;
    let dy = p.y - j.oy;
    const l = Math.hypot(dx, dy);
    // topuz halkanın içinde kalır; merkez yerinden oynamaz
    if (l > j.R) { dx = (dx / l) * j.R; dy = (dy / l) * j.R; }
    j.x = j.ox + dx;
    j.y = j.oy + dy;
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerId === joy.current.id) { joy.current.id = null; joy.current.active = false; setJoyActive(false); }
  };
  const kickDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    kickHeld.current = true;
    setKickOn(true);
    capture(e);
    if (!audio) { try { audio = new AudioContext(); } catch { /* yok */ } }
  };
  const kickUp = () => { kickHeld.current = false; setKickOn(false); };

  const resume = () => { paused.current = false; setOverlay(null); };
  const restart = () => setRound((r) => r + 1);
  const toggleSound = () => {
    setSound((s) => {
      soundRef.current = !s;
      try { localStorage.setItem(SOUND_KEY, s ? '0' : '1'); } catch { /* yok */ }
      return !s;
    });
  };

  // ilk etkileşimde ses bağlamı (tarayıcılar kullanıcı hareketi ister)
  useEffect(() => {
    const unlock = () => { if (!audio) { try { audio = new AudioContext(); } catch { /* yok */ } } void audio?.resume(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const clock = hud.golden ? t('hud.golden') : `${Math.floor(hud.left / 60)}:${String(hud.left % 60).padStart(2, '0')}`;
  const end = overlay?.kind === 'end' ? overlay : null;
  const result = end ? (end.score[0] > end.score[1] ? 'win' : end.score[0] < end.score[1] ? 'loss' : 'draw') : null;

  return (
    <div
      className={styles.stage}
      style={{
        width: stageW,
        height: stageH,
        transform: rotated ? `translateX(${vp.w}px) rotate(90deg)` : undefined,
      }}
      role="application"
      aria-label={t('title')}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {/* skor tabelası: yayın tarzı — takım şeritleri, büyük skorlar, ortada süre */}
      <div className={styles.hud}>
        <div className={styles.scorebug} aria-live="polite">
          <span className={`${styles.team} ${styles.teamA}`}>{t(opts.mode === '2v2' ? 'hud.homeTeam' : 'hud.home')}</span>
          <span className={styles.score}>{hud.score[0]}</span>
          <span className={hud.golden ? `${styles.clock} ${styles.golden}` : styles.clock}>{clock}</span>
          <span className={styles.score}>{hud.score[1]}</span>
          <span className={`${styles.team} ${styles.teamB}`}>{rivalChar ? t(`chars.${rivalChar}.name`) : t('hud.away')}</span>
        </div>
      </div>
      <button type="button" className={styles.pauseBtn} onClick={pause} aria-label={t('hud.pause')}>
        <span aria-hidden>II</span>
      </button>
      {touch && !joyActive && !overlay ? <div className={styles.joyHint} aria-hidden><span /></div> : null}
      {touch ? (
        <button
          type="button"
          className={kickOn ? `${styles.kickBtn} ${styles.kickOn}` : styles.kickBtn}
          onPointerDown={kickDown}
          onPointerUp={kickUp}
          onPointerCancel={kickUp}
          onLostPointerCapture={kickUp}
          aria-label={t('hud.kick')}
        >
          {t('hud.kick')}
        </button>
      ) : null}
      {/* kontrol edilen oyuncu: küçük portre → ad → numara (dokunuşlar alttaki sahaya geçer) */}
      <div className={styles.mePanel} aria-hidden>
        <Portrait id={opts.myChar} variant="face" size={36} className={styles.meFace} />
        <span className={styles.meText}>
          <span className={styles.meName}>{t(`chars.${opts.myChar}.name`)}</span>
          <span className={styles.meNo}>{CHARACTERS[opts.myChar].no}</span>
        </span>
      </div>
      {banner ? (
        <div className={styles.toast} key={banner.id} role="status">
          {banner.charId ? (
            <Portrait id={banner.charId} variant="face" size={40} className={banner.team === 1 ? `${styles.toastFace} ${styles.toastFaceB}` : styles.toastFace} />
          ) : null}
          <span className={styles.toastName}>{banner.text}</span>
          {banner.team !== null ? (
            <span className={banner.team === 0 ? styles.toastGoalA : styles.toastGoalB}>{t('hud.goal')}</span>
          ) : null}
        </div>
      ) : null}

      {overlay?.kind === 'pause' ? (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>{t('pause.title')}</h2>
            <div className={styles.modalRow}>
              <button type="button" className={styles.primary} onClick={resume}>{t('pause.resume')}</button>
              {online ? null : <button type="button" className={styles.secondary} onClick={restart}>{t('pause.restart')}</button>}
              <button type="button" className={styles.secondary} onClick={onExit}>{t('pause.exit')}</button>
            </div>
            <button type="button" className={styles.linkBtn} onClick={toggleSound} aria-pressed={sound}>
              {t('pause.sound')}: {sound ? t('pause.on') : t('pause.off')}
            </button>
          </div>
        </div>
      ) : null}

      {online && onlineStatus ? <OnlinePanel client={online} status={onlineStatus} score={hud.score} onExit={onExit} /> : null}

      {end && result ? (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <p className={styles.modalKicker}>{t(`end.${result}`)}</p>
            <div className={styles.result}>
              <span className={styles.dotA} />
              {end.score[0]} – {end.score[1]}
              <span className={styles.dotB} />
            </div>
            {end.unlocked && end.unlocked.length > 0 ? (
              <div className={styles.unlocked}>
                <strong>{t('end.unlocked')}</strong>
                <span>{end.unlocked.map((id) => t(`chars.${id}.name`)).join(', ')}</span>
              </div>
            ) : null}
            <div className={styles.modalRow}>
              <button type="button" className={styles.primary} onClick={restart}>{t('end.again')}</button>
              <button type="button" className={styles.secondary} onClick={onExit}>{t('end.exit')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

