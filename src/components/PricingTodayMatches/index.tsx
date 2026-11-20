/**
 * Fiyatlandırma hero'sunun sağ kartı: günün (yoksa yarının) öne çıkan, başlamamış maçları. Satır maç sayfasının
 * AI Analiz sekmesine gider (`?sekme=ai-analiz`) — bu bağlantı yalnız sekmeyi açar; kredi yalnız kullanıcı orada
 * düğmeye basınca harcanır (bkz. MatchDetailContent/tabDeepLink.ts). Veri ISR (pricing getStaticProps), istemci istek atmaz.
 */
import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import type { PricingTodayData } from '@/server/pricingTodayMatches';
import styles from './pricingTodayMatches.module.scss';

export const AI_TAB_QUERY = 'sekme=ai-analiz';

export function aiTabHref(href: string): string {
  const [path, hash] = href.split('#');
  return `${path}${path.includes('?') ? '&' : '?'}${AI_TAB_QUERY}${hash ? `#${hash}` : ''}`;
}

export default function PricingTodayMatches({ data }: { data: PricingTodayData }) {
  const { t } = useTranslation('credits');
  return (
    <section className={styles.card} aria-labelledby="pricing-today-title">
      <div className={styles.head}>
        <h2 id="pricing-today-title" className={styles.title}>
          <span className={styles.dot} aria-hidden="true" />
          {data.day === 'tomorrow' ? t('today.tomorrowTitle') : t('today.title')}
        </h2>
        <p className={styles.sub}>{t('today.sub')}</p>
      </div>
      <ul className={styles.list}>
        {data.matches.map((m) => (
          <li key={m.id} className={styles.item}>
            <Link
              href={aiTabHref(m.href)}
              className={styles.row}
              aria-label={t('today.ctaLabel', {
                home: m.home.name,
                away: m.away.name,
              })}
            >
              <span className={styles.meta}>
                {m.competition.logo ? (
                  <TeamLogo src={m.competition.logo} alt="" width={14} height={14} className={styles.compLogo} />
                ) : null}
                <span className={styles.comp}>{m.competition.name}</span>
                <span className={styles.time}>{m.time ?? '–'}</span>
              </span>
              <span className={styles.teams}>
                <span className={styles.team}>
                  <TeamLogo src={m.home.logo} alt="" width={22} height={22} className={styles.logo} />
                  <span className={styles.name}>{m.home.name}</span>
                </span>
                <span className={styles.team}>
                  <TeamLogo src={m.away.logo} alt="" width={22} height={22} className={styles.logo} />
                  <span className={styles.name}>{m.away.name}</span>
                </span>
              </span>
              <span className={styles.action}>
                {m.ready ? <span className={styles.ready}>{t('today.ready')}</span> : null}
                <span className={styles.cta}>
                  {t('today.cta')} <span aria-hidden="true">→</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className={styles.all}>
        {t('today.allMatches')} →
      </Link>
    </section>
  );
}
