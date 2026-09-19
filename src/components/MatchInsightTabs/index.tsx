import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from '@/lib/i18n';
import MatchTrivia from '@/components/MatchTrivia';
import MatchAnalysis from '@/components/MatchAnalysis';
import MatchCommunity from '@/components/MatchCommunity';
import type { Match } from '@/models/liveScore';
import styles from './matchInsightTabs.module.scss';

export type InsightTabKey = 'trivia' | 'analysis' | 'community';

export const INSIGHT_TABS: readonly { key: InsightTabKey; premium: boolean }[] = [
  { key: 'trivia', premium: true },
  { key: 'analysis', premium: true },
  { key: 'community', premium: false },
];

/** Varsayılan sekme: Trivia (mevcut sıralamadaki ilk bölüm; hafif, giriş yapmadan da içerik gösterir). */
export const DEFAULT_INSIGHT_TAB: InsightTabKey = 'trivia';

type Props = {
  matchId: string;
  match: Match | null;
};

/**
 * Trivia | Analiz | Topluluk — tek kart, sekmeye göre içerik. Topluluk = tahmin pill'leri + yorumlar
 * (tahmin ayrı sekme DEĞİL). Üç panel de DOM'da kalır (yalnızca `hidden`), böylece sekme değişince
 * devam eden AI analiz üretimi / yazılmakta olan yorum gibi durumlar kaybolmaz.
 */
export default function MatchInsightTabs({ matchId, match }: Props) {
  const { t } = useTranslation('match');
  const uid = useId();
  const [active, setActive] = useState<InsightTabKey>(DEFAULT_INSIGHT_TAB);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + INSIGHT_TABS.length) % INSIGHT_TABS.length;
    setActive(INSIGHT_TABS[next].key);
    document.getElementById(`${uid}-tab-${INSIGHT_TABS[next].key}`)?.focus();
  };

  return (
    <section
      className={`${styles.card} ${active !== 'community' ? styles.cardPremium : ''}`.trim()}
      aria-label={t('insights.label')}
    >
      <div className={styles.tabList} role="tablist" aria-label={t('insights.label')}>
        {INSIGHT_TABS.map(({ key, premium }, i) => (
          <button
            key={key}
            id={`${uid}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={active === key}
            aria-controls={`${uid}-panel-${key}`}
            tabIndex={active === key ? 0 : -1}
            className={`${styles.tab} ${active === key ? styles.tabActive : ''}`.trim()}
            onClick={() => setActive(key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t(`insights.${key}`)}
            {premium ? <span className={styles.premiumDot} title={t('premiumBadge')} aria-label={t('premiumBadge')} /> : null}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {INSIGHT_TABS.map(({ key }) => (
          <div
            key={key}
            id={`${uid}-panel-${key}`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${key}`}
            hidden={active !== key}
          >
            {key === 'trivia' ? <MatchTrivia matchId={matchId} match={match} /> : null}
            {key === 'analysis' ? <MatchAnalysis matchId={matchId} match={match} /> : null}
            {key === 'community' && matchId ? <MatchCommunity matchId={matchId} embedded /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
