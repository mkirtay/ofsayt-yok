import { useEffect, useState } from 'react';
import LazyLoad from '@/components/LazyLoad';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { BP_SPLIT } from '@/config/breakpoints';
import { useTranslation } from '@/lib/i18n';
import type { MatchChatPanelProps } from './MatchChatPanel';
import styles from './matchChatPanel.module.scss';

const loadPanel = () => import('./MatchChatPanel');
const WIDE_QUERY = `(min-width: ${BP_SPLIT}px)`;

/**
 * Maç sayfası sağ sütunundaki "Maç sohbeti" yuvası. SSR'da yalnız boş, sabit boyutlu kutu çizilir (CLS 0; içerik
 * yok → LCP adayı değil, SSR/CDN yükü yok). Dar ekranda (< BP_SPLIT) CSS ile gizli ve panel kodu HİÇ indirilmez;
 * genişte görünür alana yaklaşınca, tarayıcı boştayken `import()` ile yüklenir.
 */
export default function MatchChatPanelSlot(props: MatchChatPanelProps) {
  const { t } = useTranslation('match');
  const [wide, setWide] = useState(false);
  const [ref, inView] = useInViewOnce<HTMLElement>('400px', 2500);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY);
    if (!mq) return;
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);
  return (
    <aside ref={ref} className={styles.slot} aria-label={t('chat.title')} data-testid="match-chat-slot">
      {wide && inView ? <LazyLoad load={loadPanel} props={props} /> : null}
    </aside>
  );
}
