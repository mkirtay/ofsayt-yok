import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { signIn } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/miniSaha';
import { CHARACTERS, CHAR_IDS, DEFAULT_CHAR, isCharId, type CharId } from '@/lib/miniSaha/characters';
import type { Difficulty, Mode } from '@/lib/miniSaha/engine';
import { UNLOCKS, requirementProgress, type Requirement } from '@/lib/miniSaha/progress';
import { Portrait, preloadFaces } from './Portrait';
import { useMiniSahaProgress } from './useProgress';
import type { StageOptions } from './Stage';
import styles from './miniSaha.module.scss';

/** Oyun sahnesi ayrı parça: "Maça başla"ya basınca yüklenir (sayfanın ilk yüküne girmez). */
const Stage = dynamic(() => import('./Stage'), { ssr: false });

const CHAR_KEY = 'oy_minisaha_char';
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
  const [mode, setMode] = useState<Mode>('1v1');
  const [diff, setDiff] = useState<Difficulty>('orta');
  const [dur, setDur] = useState<number>(180);
  const [playing, setPlaying] = useState<StageOptions | null>(null);
  const rosterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // maç içi panel / gol bildirimi portreleri maç başlamadan insin
    preloadFaces(CHAR_IDS);
    try {
      const c = localStorage.getItem(CHAR_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR ile aynı ilk değer; kayıtlı seçim hydration sonrası
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
          <div className={styles.seg}>{(['1v1', '2v2'] as const).map((m) => seg(m, mode, setMode, t(`mode.${m}`)))}</div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('diff.label')}</span>
          <div className={styles.seg}>{(['kolay', 'orta', 'zor'] as const).map((d) => seg(d, diff, setDiff, t(`diff.${d}`)))}</div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('dur.label')}</span>
          <div className={styles.seg}>{DURS.map((d) => seg<number>(d, dur, setDur, t('dur.min', { n: d / 60 })))}</div>
        </div>
        <button type="button" className={styles.start} onClick={() => setPlaying({ mode, diff, durSec: dur, myChar: chosen })}>
          {t('start')}
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

      {playing ? <Stage opts={playing} onFinish={record} onExit={() => setPlaying(null)} /> : null}
    </div>
  );
}
