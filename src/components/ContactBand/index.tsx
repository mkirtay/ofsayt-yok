import { useI18n } from '@/lib/i18n';
import LazyLoad from '@/components/LazyLoad';
import styles from './contactBand.module.scss';

const TAGLINE: Record<string, string> = { tr: 'Topu bize at.', en: 'Pass it to us.' };

// 16 sahnesi ayrı parçada; bant (zemin + sabit yükseklik) baştan çizili, sahne gelince üstüne oturur (kayma yok).
const loadScene = () => import('./ContactBandScene');

/** 16 · İletişim bandı (docs/animasyon-referans/16-iletisim-bandi.html): paslaşma → zarf kale, altında slogan. */
export default function ContactBand() {
  const { locale } = useI18n();
  return (
    <div className={styles.wrap}>
      <div className={styles.band} aria-hidden="true">
        <span className={styles.stripes} />
        <span className={styles.line} />
        <LazyLoad load={loadScene} props={{}} />
      </div>
      <p className={styles.tagline}>{TAGLINE[locale] ?? TAGLINE.tr}</p>
    </div>
  );
}
