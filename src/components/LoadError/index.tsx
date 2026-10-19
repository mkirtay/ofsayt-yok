import { useTranslation } from '@/lib/i18n';
import styles from './loadError.module.scss';

export type LoadErrorProps = {
  /** Varsayılan: "Veriler yüklenemedi." */
  message?: string;
  onRetry?: () => void;
  className?: string;
};

/**
 * "Yüklenemedi · Tekrar dene" kutusu — sağlayıcı hatası / zaman aşımı, "veri yok"tan (EmptyState) AYRI. Kırmızı
 * kullanmaz (geçici durum); EmptyState ile aynı çerçeve, altta yeniden deneme düğmesi (≥ 32 px hedef).
 */
export default function LoadError({ message, onRetry, className }: LoadErrorProps) {
  const { t } = useTranslation('common');
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} role="status" data-testid="load-error">
      <p className={styles.text}>{message ?? t('loadError')}</p>
      {onRetry ? (
        <button type="button" className={styles.retry} onClick={onRetry}>
          {t('retry')}
        </button>
      ) : null}
    </div>
  );
}
