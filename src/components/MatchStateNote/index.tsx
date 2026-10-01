import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import type { MatchSpecialState } from '@/utils/matchDisplayState';
import styles from './matchStateNote.module.scss';

/**
 * Özel maç durumu (ertelendi, iptal, yarıda kaldı…). `message`: kartın yerine tek mesaj; `banner`: verinin üstünde
 * durum satırı (yarıda kalan / durdurulan / hükmen maçta oynanmış kısmın verisi görünür).
 */
export default function MatchStateNote({ special, variant }: { special: MatchSpecialState; variant: 'message' | 'banner' }) {
  const { t } = useTranslation('matchState');
  return (
    <div className={variant === 'banner' ? styles.banner : styles.message} role="status">
      {t(`special.${special}`)}
    </div>
  );
}
