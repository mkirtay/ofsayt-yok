/* eslint-disable @next/next/no-img-element -- şeffaf kadro görseli zaten boyutlandırılmış WebP (public/mini-saha/kadro.webp); next/image optimizasyonu gerekmez */
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import styles from './miniSahaHomeCard.module.scss';

/**
 * Ana sayfa "Mini Saha" kartı (Günün Frikiği / Tahmin şeridinin altında, maç listesinin sabit yükseklikli satırında).
 * Zemin CSS ile çizilen gece stadyumu (ışık hüzmeleri, taraftar noktaları, orta saha çizgisi) — görsel isteği yok;
 * sağda beş karakterin kadro görseli (tembel yüklenir, sabit en/boy → kayma yok). SABİT yükseklik (bkz. scss ve
 * MatchHubPage FRIKIK_BASE_SLOT). Metinler `common` ad alanında (ana sayfa paketi).
 */
export default function MiniSahaHomeCard() {
  const { t } = useTranslation('common');
  return (
    <Link href="/mini-saha?src=home_card" className={styles.card} aria-labelledby="mini-saha-card-title">
      <span className={styles.crowd} aria-hidden="true" />
      <span className={styles.text}>
        <span className={styles.kicker}>{t('miniSahaCard.kicker')}</span>
        <span id="mini-saha-card-title" className={styles.title}>{t('miniSahaCard.title')}</span>
        <span className={styles.sub}>{t('miniSahaCard.sub')}</span>
      </span>
      <img
        className={styles.squad}
        src="/mini-saha/kadro.webp"
        width={600}
        height={260}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <span className={styles.cta}>{t('miniSahaCard.play')}</span>
    </Link>
  );
}
