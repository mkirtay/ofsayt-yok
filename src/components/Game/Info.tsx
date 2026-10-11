import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import { GAME_BRAND } from '@/config/brand';
import { POINTS } from '@/lib/game/scoring';
import styles from './game.module.scss';

/** Puan tablosu — değerler lib/game/scoring.ts'ten (metin ile kural ayrışmasın). */
export function ScoringTable() {
  const { t } = useTranslation('game');
  const rows: [string, string][] = [
    ['dir', `${POINTS.direction}`],
    ['diff', `+${POINTS.difference}`],
    ['total', `+${POINTS.totalGoals}`],
    ['exact', `+${POINTS.exact}`],
    ['rare', `+${POINTS.rare}`],
    ['joker', '×2'],
  ];
  return (
    <div className={styles.card}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('scoring.criterion')}</th>
            <th scope="col">{t('scoring.condition')}</th>
            <th scope="col" className={styles.num}>
              {t('scoring.points')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, p]) => (
            <tr key={k}>
              <td>
                <strong>{t(`scoring.${k}`)}</strong>
              </td>
              <td>{t(`scoring.${k}C`)}</td>
              <td className={styles.num}>{p}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.muted} style={{ marginTop: 12 }}>
        {t('scoring.max')}
      </p>
    </div>
  );
}

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

/** Puanlama / Kurallar sekmeli "Nasıl oynanır" bölümü. */
export function HowToPlay() {
  const { t } = useTranslation('game');
  const [tab, setTab] = useState<'scoring' | 'rules'>('scoring');
  return (
    <section id="nasil" className={styles.section} aria-labelledby="game-how-title">
      <h2 id="game-how-title" className={styles.h2}>
        {t('how.title')}
      </h2>
      <div className={styles.tabs} role="tablist" aria-label={t('how.title')}>
        {(['scoring', 'rules'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={styles.tab} onClick={() => setTab(k)}>
            {t(k === 'scoring' ? 'how.tabScoring' : 'how.tabRules')}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'scoring' ? (
          <>
            <ScoringTable />
            <p className={styles.muted} style={{ marginTop: 8 }}>
              {t('how.example')}
            </p>
          </>
        ) : (
          <div className={styles.card}>
            <RulesList />
          </div>
        )}
      </div>
      <Link href={`${GAME_BRAND.basePath}/kurallar`}>{t('how.allRules')} →</Link>
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
