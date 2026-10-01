import { useEffect, useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/kuralKosesi';
import { useDelayedShow } from '@/hooks/useDelayedShow';
import { loadFacts, localizeFact, type KuralFact } from './facts';
import { openKuralKosesi } from './openEvent';
import { dailyIndex } from './schedule';
import WhistleIcon from './WhistleIcon';
import styles from './dailyFactCard.module.scss';

/**
 * Bekleme ekranlarında (AI Analiz, Trivia) animasyonun altında günün Kural Köşesi bilgisi. Kutu sabit yükseklikte
 * hemen yer kaplar (kayma yok); içerik 300 ms sonra ve JSON gelince görünür. Düğme paneli günün bilgisiyle açar.
 */
export default function DailyFactCard() {
  const { t } = useTranslation('kuralKosesi');
  const { locale } = useI18n();
  const shown = useDelayedShow(300);
  const [fact, setFact] = useState<{ item: KuralFact } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFacts().then(
      (list) => {
        if (!cancelled && list.length > 0) setFact({ item: list[dailyIndex(Date.now(), list.length)] });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const view = fact ? localizeFact(fact.item, locale) : null;
  return (
    <aside className={`${styles.card} ${shown && view ? '' : styles.hidden}`} aria-label={t('didYouKnow')}>
      <span className={styles.badge}>
        <WhistleIcon size={16} />
      </span>
      <div className={styles.content}>
        <small>{t('didYouKnow')}</small>
        <strong>{view?.title}</strong>
        <p>{view?.body}</p>
        <button type="button" className={styles.open} onClick={openKuralKosesi}>
          {t('openInCorner')} ›
        </button>
      </div>
    </aside>
  );
}
