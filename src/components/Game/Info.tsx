import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import { GAME_BRAND } from '@/config/brand';
import { POINTS, scorePrediction, type Score } from '@/lib/game/scoring';
import styles from './game.module.scss';

export const RULE_KEYS = ['lock', 'week', 'regular', 'void', 'tiebreak', 'visible', 'noPrize'] as const;

export function RulesList() {
  const { t } = useTranslation('game');
  return (
    <ul className={styles.rulesList}>
      {RULE_KEYS.map((k) => (
        <li key={k}>{t(`rules.${k}`)}</li>
      ))}
    </ul>
  );
}

type Pts = { key: 'dir' | 'diff' | 'total' | 'exact' | 'rare' | 'joker'; icon: string; chip: string };

/** Puan kuralları (görsel liste) — değerler lib/game/scoring.ts'ten. */
const POINT_RULES: readonly Pts[] = [
  { key: 'dir', icon: '✔', chip: `${POINTS.direction}` },
  { key: 'diff', icon: '↔', chip: `+${POINTS.difference}` },
  { key: 'total', icon: '⚽', chip: `+${POINTS.totalGoals}` },
  { key: 'exact', icon: '🎯', chip: `+${POINTS.exact}` },
  { key: 'rare', icon: '💎', chip: `+${POINTS.rare}` },
  { key: 'joker', icon: '★', chip: '×2' },
];

/** Örnek senaryolar: puan `scorePrediction` ile hesaplanır (metin ile kural ayrışmasın). */
const SCENARIOS: readonly { key: 'exact' | 'draw' | 'joker'; pred: Score; actual: Score; joker: boolean }[] = [
  { key: 'exact', pred: { home: 1, away: 0 }, actual: { home: 1, away: 0 }, joker: false },
  { key: 'draw', pred: { home: 1, away: 1 }, actual: { home: 2, away: 2 }, joker: false },
  { key: 'joker', pred: { home: 2, away: 0 }, actual: { home: 3, away: 1 }, joker: true },
];

const EXAMPLE = { pred: { home: 2, away: 1 }, actual: { home: 3, away: 2 } } as const;
const MAX_MATCH_POINTS = POINTS.direction + POINTS.difference + POINTS.totalGoals + POINTS.exact + POINTS.rare;

function MiniScore({ label, score, tone }: { label: string; score: Score; tone: 'pick' | 'result' }) {
  return (
    <div className={styles.miniScore} data-tone={tone}>
      <span>{label}</span>
      <strong>
        {score.home}-{score.away}
      </strong>
    </div>
  );
}

/** Puan kuralları: ikon + kısa cümle + puan çipi. */
export function PointRules() {
  const { t } = useTranslation('game');
  return (
    <ul className={styles.pointRules}>
      {POINT_RULES.map((r) => (
        <li key={r.key} data-key={r.key}>
          <span className={styles.pointIcon} aria-hidden="true">
            {r.icon}
          </span>
          <span className={styles.pointText}>
            <strong>{t(`easy.${r.key}.title`)}</strong>
            <span>{t(`easy.${r.key}.text`)}</span>
          </span>
          <span className={styles.pointChip} data-key={r.key}>
            {r.chip}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Tahminin 2-1, sonuç 3-2" örneği: mini skor kartları + adım adım dolan puan çubuğu. */
export function ScoreExample() {
  const { t } = useTranslation('game');
  const { points, breakdown } = scorePrediction(EXAMPLE.pred, EXAMPLE.actual, { rare: false, joker: false });
  const steps = (['dir', 'diff', 'total', 'exact'] as const).map((k) => ({ k, value: breakdown[k] }));
  return (
    <figure className={styles.example}>
      <figcaption className={styles.exampleTitle}>{t('easy.exampleTitle')}</figcaption>
      <div className={styles.exampleScores}>
        <MiniScore label={t('easy.yourPick')} score={EXAMPLE.pred} tone="pick" />
        <span aria-hidden="true">→</span>
        <MiniScore label={t('easy.result')} score={EXAMPLE.actual} tone="result" />
      </div>
      <ol className={styles.exampleSteps}>
        {steps.map(({ k, value }) => (
          <li key={k} data-ok={value > 0 ? '' : undefined}>
            <span aria-hidden="true">{value > 0 ? '✓' : '✗'}</span>
            <span>{t(`easy.${k}.short`)}</span>
            <strong>{value > 0 ? `+${value}` : '0'}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.exampleBar} role="img" aria-label={t('easy.barLabel', { points, max: MAX_MATCH_POINTS })}>
        {steps.map(({ k, value }) => (value > 0 ? <span key={k} style={{ width: `${(value / MAX_MATCH_POINTS) * 100}%` }} /> : null))}
      </div>
      <p className={styles.exampleTotal}>
        {t('easy.fromMatch')} <strong>{t('week.points', { count: points })}</strong>
      </p>
    </figure>
  );
}

/** Örnek senaryo kartları (tam skor, beraberlik, joker). */
export function Scenarios() {
  const { t } = useTranslation('game');
  return (
    <ul className={styles.scenarios}>
      {SCENARIOS.map((sc) => {
        const { points } = scorePrediction(sc.pred, sc.actual, { rare: false, joker: sc.joker });
        return (
          <li key={sc.key} data-joker={sc.joker ? '' : undefined}>
            <strong className={styles.scenarioTitle}>{t(`easy.sc.${sc.key}.title`)}</strong>
            <span className={styles.scenarioScores}>
              {sc.pred.home}-{sc.pred.away} → {sc.actual.home}-{sc.actual.away}
            </span>
            <span className={styles.scenarioText}>{t(`easy.sc.${sc.key}.text`)}</span>
            <span className={styles.scenarioPts}>{t('week.points', { count: points })}</span>
          </li>
        );
      })}
    </ul>
  );
}

export const EASY_RULE_KEYS = ['lock', 'week', 'regular', 'void', 'tiebreak', 'visible', 'free'] as const;
const RULE_ICONS: Record<(typeof EASY_RULE_KEYS)[number], string> = { lock: '🔒', week: '📅', regular: '⏱', void: '✖', tiebreak: '⚖', visible: '👤', free: '🎁' };

/** Kurallar: ikonlu kısa kartlar (ayrıntılı metin /kurallar sayfasında). */
export function EasyRules() {
  const { t } = useTranslation('game');
  return (
    <ul className={styles.easyRules}>
      {EASY_RULE_KEYS.map((k) => (
        <li key={k}>
          <span className={styles.ruleIcon} aria-hidden="true">
            {RULE_ICONS[k]}
          </span>
          <span>
            <strong>{t(`easyRules.${k}.title`)}</strong>
            <span>{t(`easyRules.${k}.text`)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Puanlama / Kurallar sekmeli "Nasıl oynanır" bölümü (yan sütun). 3 adım şeridi + görsel puanlama + örnekler. */
export function HowToPlay() {
  const { t } = useTranslation('game');
  const [tab, setTab] = useState<'scoring' | 'rules'>('scoring');
  return (
    <section id="nasil" className={styles.sideSection} aria-labelledby="game-how-title">
      <h2 id="game-how-title" className={styles.sideTitle}>
        {t('how.title')}
      </h2>
      <ol className={styles.stepsMini}>
        {(['s1', 's2', 's3'] as const).map((k, i) => (
          <li key={k}>
            <span aria-hidden="true">{i + 1}</span>
            {t(`easy.steps.${k}`)}
          </li>
        ))}
      </ol>
      <div className={styles.tabs} role="tablist" aria-label={t('how.title')}>
        {(['scoring', 'rules'] as const).map((k) => (
          <button key={k} type="button" role="tab" id={`game-how-tab-${k}`} aria-selected={tab === k} aria-controls="game-how-panel" className={styles.tab} onClick={() => setTab(k)}>
            {t(k === 'scoring' ? 'how.tabScoring' : 'how.tabRules')}
          </button>
        ))}
      </div>
      <div id="game-how-panel" role="tabpanel" aria-labelledby={`game-how-tab-${tab}`} className={styles.sideCard}>
        {tab === 'scoring' ? (
          <>
            <p className={styles.sideLead}>{t('easy.lead')}</p>
            <PointRules />
            <p className={styles.sideNote}>{t('easy.max')}</p>
            <ScoreExample />
            <h3 className={styles.sideSub}>{t('easy.scTitle')}</h3>
            <Scenarios />
          </>
        ) : (
          <EasyRules />
        )}
      </div>
      <Link href={`${GAME_BRAND.basePath}/kurallar`} className={styles.sideLink}>
        {t('how.allRules')} →
      </Link>
    </section>
  );
}

export const FAQ_KEYS = [1, 2, 3, 4, 5] as const;

export function Faq() {
  const { t } = useTranslation('game');
  return (
    <section className={styles.section} aria-labelledby="game-faq-title">
      <h2 id="game-faq-title" className={styles.h2}>
        {t('faq.title')}
      </h2>
      <div className={styles.faq}>
        {FAQ_KEYS.map((n) => (
          <details key={n}>
            <summary>{t(`faq.q${n}`)}</summary>
            <p>{t(`faq.a${n}`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Alt gezinme: Tahmin yap · Sıralama · Kurallar. */
export function GameNav({ current }: { current: 'play' | 'leaderboard' | 'rules' }) {
  const { t } = useTranslation('game');
  const base = GAME_BRAND.basePath;
  const items = [
    ['play', base],
    ['leaderboard', `${base}/siralama`],
    ['rules', `${base}/kurallar`],
  ] as const;
  return (
    <nav className={styles.subnav} aria-label={GAME_BRAND.name}>
      {items.map(([k, href]) => (
        <Link key={k} href={href} aria-current={current === k ? 'page' : undefined}>
          {t(`nav.${k}`)}
        </Link>
      ))}
    </nav>
  );
}
