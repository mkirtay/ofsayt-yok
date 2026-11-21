import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { signIn } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/miniSaha';
import { CHARACTERS, CHAR_IDS, DEFAULT_CHAR, isCharId, type CharId } from '@/lib/miniSaha/characters';
import type { Difficulty, Mode } from '@/lib/miniSaha/engine';
import { UNLOCKS, requirementProgress, type Requirement } from '@/lib/miniSaha/progress';
import { CODE_RE, ONLINE_DUR_SEC, newRoomCode } from '@/lib/miniSaha/protocol';
import { OnlineClient, onlineServer } from './online';
import { Portrait, preloadFaces } from './Portrait';
import { useMiniSahaProgress } from './useProgress';
import type { StageOptions } from './Stage';
import styles from './miniSaha.module.scss';

/** Oyun sahnesi ayrı parça: "Maça başla"ya basınca yüklenir (sayfanın ilk yüküne girmez). */
const Stage = dynamic(() => import('./Stage'), { ssr: false });

const CHAR_KEY = 'oy_minisaha_char';

/** Kriptografik rastgele [0, 1) — oda kodu tahmin edilemesin. */
function cryptoRnd(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

/** Adres çubuğundaki ?oda= parametresini yazar / siler (sayfa yenilenmeden). */
function setRoomParam(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('oda', code);
  else url.searchParams.delete('oda');
  window.history.replaceState(window.history.state, '', url.toString());
}
const DURS = [120, 180, 300] as const;

function reqText(t: (k: string, o?: Record<string, unknown>) => string, req: Requirement): string {
  return req.kind === 'wins' || req.kind === 'goalsInMatch' ? t(`req.${req.kind}`, { n: req.n }) : t(`req.${req.kind}`);
}

const LockIcon = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
    <path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4zm2 0h4V5a2 2 0 1 0-4 0v2z" />
  </svg>
);

/**
 * /mini-saha: kadro (portreli yatay karakter seçici; oynayarak açılır), seçili karakterin değerleri, mod / rakip / süre
 * ve "Maça başla" → tam ekran yatay sahne (Stage).
 */
export default function MiniSaha() {
  const { t } = useTranslation('miniSaha');
  const { progress, record, signedIn } = useMiniSahaProgress();
  const [sel, setSel] = useState<CharId>(DEFAULT_CHAR);
  const [mode, setMode] = useState<Mode | 'online'>('1v1');
  /** Online oyun sunucusu (tanımsızsa online seçenek gizli). */
  const server = onlineServer();
  /** Davet linkiyle gelindiyse oda kodu. */
  const [invite, setInvite] = useState<string | null>(null);
  const [onlineGame, setOnlineGame] = useState<OnlineClient | null>(null);
  const [diff, setDiff] = useState<Difficulty>('orta');
  const [dur, setDur] = useState<number>(180);
  const [playing, setPlaying] = useState<StageOptions | null>(null);
  const rosterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // maç içi panel / gol bildirimi portreleri maç başlamadan insin
    preloadFaces(CHAR_IDS);
    const code = new URLSearchParams(window.location.search).get('oda')?.toUpperCase() ?? '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- davet kodu adres çubuğundan, yalnız istemcide
    if (CODE_RE.test(code)) setInvite(code);
    try {
      const c = localStorage.getItem(CHAR_KEY);
      if (isCharId(c)) setSel(c);
    } catch {
      /* depolama kapalı */
    }
  }, []);
  // seçili karakter kilitliyse (ör. başka cihaz) varsayılana dön
  const chosen: CharId = progress.unlocked.includes(sel) ? sel : DEFAULT_CHAR;

  // dar ekranda seçili kart kadronun ortasına kaysın
  useEffect(() => {
    const el = rosterRef.current?.querySelector<HTMLElement>(`[data-id="${chosen}"]`);
    const box = rosterRef.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [chosen]);

  const choose = (id: CharId) => {
    setSel(id);
    try { localStorage.setItem(CHAR_KEY, id); } catch { /* yok */ }
  };

  const startOnline = (code: string) => {
    if (!server) return;
    setRoomParam(code);
    setOnlineGame(new OnlineClient(server, code, chosen));
    setPlaying({ mode: '1v1', diff: 'orta', durSec: ONLINE_DUR_SEC, myChar: chosen });
  };
  const exitGame = useCallback(() => {
    setOnlineGame((g) => {
      g?.dispose();
      return null;
    });
    setPlaying(null);
    setInvite(null);
    setRoomParam(null);
  }, []);
  const start = () => {
    if (mode === 'online') startOnline(newRoomCode(cryptoRnd));
    else setPlaying({ mode, diff, durSec: dur, myChar: chosen });
  };
  const isOnline = mode === 'online';

  const c = CHARACTERS[chosen];
  const seg = <T extends string | number>(value: T, cur: T, set: (v: T) => void, label: string) => (
    <button key={String(value)} type="button" aria-pressed={value === cur} className={styles.segBtn} onClick={() => set(value)}>
      {label}
    </button>
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {invite && server ? (
        <section className={`${styles.panel} ${styles.invite}`} aria-labelledby="ms-invite">
          <div>
            <h2 id="ms-invite" className={styles.inviteTitle}>{t('joinTitle')}</h2>
            <p className={styles.help}>{t('joinText')}</p>
          </div>
          <button type="button" className={styles.start} onClick={() => startOnline(invite)}>{t('joinBtn')}</button>
        </section>
      ) : null}

      <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="ms-char">
        <div className={styles.panelHead}>
          <h2 id="ms-char" className={styles.label}>{t('pickChar')}</h2>
          <span className={styles.record}>{t('record', { matches: progress.matches, wins: progress.wins })}</span>
        </div>

        <div className={styles.roster} ref={rosterRef}>
          {CHAR_IDS.map((id) => {
            const open = progress.unlocked.includes(id);
            const req = UNLOCKS[id];
            const prog = req ? requirementProgress(req, progress) : null;
            const selected = id === chosen;
            return (
              <button
                key={id}
                type="button"
                data-id={id}
                className={styles.rosterCard}
                aria-pressed={selected}
                disabled={!open}
                onClick={() => choose(id)}
                aria-label={open ? `${t(`chars.${id}.name`)}, ${CHARACTERS[id].no}` : `${t(`chars.${id}.name`)}: ${t('lockedHint', { req: reqText(t, req!) })}`}
              >
                <span className={styles.portrait}>
                  <Portrait id={id} variant="lg" size={selected ? 132 : 112} />
                </span>
                <span className={styles.rosterMeta}>
                  <span className={styles.rosterName}>{t(`chars.${id}.name`)}</span>
                  <span className={styles.rosterNo}>{CHARACTERS[id].no}</span>
                </span>
                {open ? (
                  <span className={styles.rosterTag}>{t(`chars.${id}.tag`)}</span>
                ) : (
                  <span className={styles.rosterLock}>
                    <LockIcon />
                    {prog ? `${reqText(t, req!)} · ${prog.have}/${prog.need}` : reqText(t, req!)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <dl className={styles.stats} aria-label={t(`chars.${chosen}.name`)}>
          {c.stat.map((v, i) => (
            <div key={i} className={styles.statRow}>
              <dt>{t(`stat.${i}`)}</dt>
              <dd>
                <span className={styles.bar}><i style={{ width: `${v}%` }} /></span>
                <output>{v}</output>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${styles.panel} ${styles.settings}`} aria-label={t('start')}>
        <div className={styles.field}>
          <span className={styles.label}>{t('mode.label')}</span>
          <div className={styles.seg}>
            {(server ? (['1v1', '2v2', 'online'] as const) : (['1v1', '2v2'] as const)).map((m) => seg<Mode | 'online'>(m, mode, setMode, t(`mode.${m}`)))}
          </div>
        </div>
        <div className={styles.field} hidden={isOnline}>
          <span className={styles.label}>{t('diff.label')}</span>
          <div className={styles.seg}>{(['kolay', 'orta', 'zor'] as const).map((d) => seg(d, diff, setDiff, t(`diff.${d}`)))}</div>
        </div>
        <div className={styles.field} hidden={isOnline}>
          <span className={styles.label}>{t('dur.label')}</span>
          <div className={styles.seg}>{DURS.map((d) => seg<number>(d, dur, setDur, t('dur.min', { n: d / 60 })))}</div>
        </div>
        {isOnline ? <p className={styles.note}>{t('onlineNote')}</p> : null}
        <button type="button" className={styles.start} onClick={start}>
          {t(isOnline ? 'startOnline' : 'start')}
        </button>
        {!signedIn ? (
          <p className={styles.note}>
            {t('guestNote')}{' '}
            <button type="button" className={styles.inlineLink} onClick={() => void signIn()}>{t('signIn')}</button>
          </p>
        ) : null}
        <div className={styles.how}>
          <h2 className={styles.label}>{t('controls.title')}</h2>
          <p className={`${styles.help} ${styles.helpDesktop}`}>{t('controls.desktop')}</p>
          <p className={`${styles.help} ${styles.helpTouch}`}>{t('controls.touch')}</p>
          <p className={styles.help}>{t('controls.rules')}</p>
        </div>
      </section>
      </div>

      {playing ? <Stage opts={playing} online={onlineGame} onFinish={record} onExit={exitGame} /> : null}
    </div>
  );
}
