import { useEffect, useRef } from 'react';
import Link from 'next/link';
import MatchDetailContent from '@/components/MatchDetailContent';
import MatchInsightTabs from '@/components/MatchInsightTabs';
import { useMatchDetail } from '@/hooks/useMatchDetail';
import { buildMatchHref } from '@/utils/matchUrl';
import styles from './matchDetailPanel.module.scss';

type Props = {
  /** Sayısal maç id'si */
  matchId: string;
  onClose: () => void;
};

/** Split-view sağ paneli: liste yanında maç detayı; kapatınca URL'den `match` param'ı silinir. */
export default function MatchDetailPanel({ matchId, onClose }: Props) {
  const detail = useMatchDetail(matchId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Yeni maç seçilince panel başa dönsün
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [matchId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fullHref = detail.match ? buildMatchHref(detail.match) : `/matches/${matchId}`;
  const showArchived = detail.isArchivedMatch && !detail.match;

  return (
    <section className={styles.panel} aria-label="Maç detayı">
      <header className={styles.bar}>
        <span className={styles.barTitle}>Maç Detayı</span>
        <div className={styles.barActions}>
          <Link href={fullHref} className={styles.fullLink}>
            Tam sayfa ↗
          </Link>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Detay panelini kapat">
            ✕
          </button>
        </div>
      </header>
      <div className={styles.scroll} ref={scrollRef}>
        {detail.notFound ? (
          <p className={styles.note}>Maç bulunamadı.</p>
        ) : showArchived ? (
          <>
            <p className={styles.note}>
              Bu maç artık canlı veri sağlayıcısında bulunmuyor. Aşağıda saklanmış içerikler (varsa) gösteriliyor.
            </p>
            <MatchInsightTabs key={matchId} matchId={matchId} match={null} />
          </>
        ) : (
          <>
            <MatchDetailContent key={matchId} detail={detail} requestedMatchId={matchId} variant="panel" />
          </>
        )}
      </div>
    </section>
  );
}
