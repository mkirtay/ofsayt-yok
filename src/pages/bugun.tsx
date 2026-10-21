import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import TeamLogo from '@/components/TeamLogo';
import SocialLinks from '@/components/Footer/SocialLinks';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/today';
import { siteBaseUrl } from '@/lib/siteUrl';
import { GAME_BRAND } from '@/config/brand';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import type { TodayLandingData, TodayLandingMatch } from '@/server/todayLanding';
import styles from './bugun.module.scss';

type Props = {
  /** `null` → build sırasında veri alınamadı: sade boş durum, 60 sn sonra yeniden üretilir. */
  data: TodayLandingData | null;
  /** Tahmin Ligi herkese açık mı (GAME_ENABLED=public); kapalı / önizlemede bağlantı yok. */
  gamePublic: boolean;
};

/**
 * ISR (ana sayfayla aynı desen): maç listesi HTML'de, istemci veri çekmez. Süre maç durumuna göre (canlı 2 dk, boşta
 * en çok 10 dk, TSİ gece yarısını geçmez). Çalışma anındaki yeniden üretim hatası → Next son başarılı sayfayı verir.
 */
export const getStaticProps: GetStaticProps<Props> = async () => {
  const { loadTodayLanding, TODAY_LANDING_REVALIDATE_FAILED } = await import('@/server/todayLanding');
  const { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } = await import('@/server/sportmonks/cachedFetch');
  const { gameMode } = await import('@/config/gameFlag');
  const gamePublic = gameMode() === 'public';
  try {
    const { data, revalidate } = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => loadTodayLanding(todayIsoIstanbul()));
    // Build sırasında soğuk önbellek + kısa bütçe listeleri boş döndürebiliyor (servis katmanı hatayı boş listeye
    // çevirir): boş derleme sayfası 10 dk beklemesin, ilk istekte 60 sn sonra yeniden üretilsin.
    const building = process.env.NEXT_PHASE === 'phase-production-build';
    return { props: { data, gamePublic }, revalidate: building && data.matches.length === 0 ? TODAY_LANDING_REVALIDATE_FAILED : revalidate };
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build') throw error;
    console.error('[bugun] build sırasında veri alınamadı — boş durum', error);
    return { props: { data: null, gamePublic }, revalidate: TODAY_LANDING_REVALIDATE_FAILED };
  }
};

function dateLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

function Status({ m }: { m: TodayLandingMatch }) {
  const { t } = useTranslation('today');
  if (m.phase === 'PRE') return <span className={styles.time}>{m.time ?? '–'}</span>;
  const label = m.phase === 'POST' ? t('fullTime') : m.phase === 'HT' ? t('halfTime') : (m.minute ?? t('live'));
  return (
    <span className={styles.scoreBox}>
      <span className={styles.score}>{m.score ?? '–'}</span>
      <span className={m.phase === 'POST' ? styles.statusDone : styles.statusLive}>{label}</span>
    </span>
  );
}

function MatchItem({ m }: { m: TodayLandingMatch }) {
  const { t } = useTranslation('today');
  return (
    <li className={styles.match}>
      <div className={styles.matchMeta}>
        {m.competition.logo ? <TeamLogo src={m.competition.logo} alt="" width={16} height={16} className={styles.compLogo} /> : null}
        <span className={styles.compName}>{m.competition.name}</span>
        <span className={styles.tier}>{t(`tier.${m.tier}`)}</span>
      </div>
      <div className={styles.teams}>
        <span className={`${styles.team} ${styles.home}`}>
          <span className={styles.teamName}>{m.home.name}</span>
          <TeamLogo src={m.home.logo} alt="" width={32} height={32} className={styles.teamLogo} />
        </span>
        <Status m={m} />
        <span className={styles.team}>
          <TeamLogo src={m.away.logo} alt="" width={32} height={32} className={styles.teamLogo} />
          <span className={styles.teamName}>{m.away.name}</span>
        </span>
      </div>
      <div className={styles.matchFoot}>
        {m.tv?.length ? (
          <span className={styles.tv}>
            {t('tv')}: {m.tv.join(', ')}
          </span>
        ) : (
          <span />
        )}
        <Link href={m.href} className={styles.cta} aria-label={t('ctaLabel', { home: m.home.name, away: m.away.name })}>
          {t('cta')} →
        </Link>
      </div>
    </li>
  );
}

export default function TodayPage({ data, gamePublic }: Props) {
  const { t } = useTranslation('today');
  const { locale } = useI18n();
  const url = `${siteBaseUrl()}/bugun`;
  const title = t('metaTitle');
  const links = [
    { href: '/frikik', key: 'frikik', icon: '⚽' },
    ...(gamePublic ? [{ href: GAME_BRAND.basePath, key: 'game', icon: '🎯' }] : []),
    { href: '/gundem', key: 'gundem', icon: '💬' },
    { href: '/ai-istatistikleri', key: 'aiStats', icon: '📊' },
  ];
  const matches = data?.matches ?? [];
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={t('metaDescription')} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={t('metaDescription')} />
        <meta property="og:url" content={url} />
        <link rel="canonical" href={url} />
      </Head>
      <Container>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            {data ? <p className={styles.date}>{dateLabel(data.date, locale)}</p> : null}
          </header>

          <section aria-labelledby="bugun-matches" className={styles.section}>
            <h2 id="bugun-matches" className={styles.sectionTitle}>
              {data?.day === 'tomorrow' ? t('tomorrowHeading') : t('todayHeading')}
            </h2>
            {data?.day === 'tomorrow' && matches.length > 0 ? <p className={styles.note}>{t('tomorrowNote')}</p> : null}
            {matches.length > 0 ? (
              <ul className={styles.matches}>
                {matches.map((m) => (
                  <MatchItem key={m.id} m={m} />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {t('empty')} <Link href="/">{t('allMatches')} →</Link>
              </p>
            )}
            {matches.length > 0 ? (
              <p className={styles.allLink}>
                <Link href="/">{t('allMatches')} →</Link>
              </p>
            ) : null}
          </section>

          <section aria-labelledby="bugun-more" className={styles.section}>
            <h2 id="bugun-more" className={styles.sectionTitle}>
              {t('moreHeading')}
            </h2>
            <ul className={styles.links}>
              {links.map((l) => (
                <li key={l.key}>
                  <Link href={l.href} className={styles.linkCard}>
                    <span className={styles.linkIcon} aria-hidden="true">
                      {l.icon}
                    </span>
                    <span className={styles.linkText}>
                      <span className={styles.linkTitle}>{t(`links.${l.key}.title`)}</span>
                      <span className={styles.linkDesc}>{t(`links.${l.key}.desc`)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <SocialLinks className={styles.social} linkClassName={styles.socialLink} label={t('socialLabel')} />
        </div>
      </Container>
    </>
  );
}
