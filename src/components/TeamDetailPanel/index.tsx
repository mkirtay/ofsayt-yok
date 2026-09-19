import { useEffect, useRef } from 'react';
import Link from 'next/link';
import TeamDetailView from '@/components/TeamDetailView';
// MatchDetailPanel'in `.panel`/`.bar`/`.scroll` (height:100% + overflow-y:auto + container-type) modeli AYNEN kullanılır.
import styles from '@/components/MatchDetailPanel/matchDetailPanel.module.scss';

type Props = {
  /** Sayısal takım id'si */
  teamId: string;
  onClose: () => void;
};

/** Split-view sağ paneli (takım): kapatınca URL'den `team` param'ı silinir. "Detaylı Görünüm" tam sayfaya gider. */
export default function TeamDetailPanel({ teamId, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [teamId]);

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

  return (
    <section className={styles.panel} aria-label="Takım detayı">
      <header className={styles.bar}>
        <span className={styles.barTitle}>Takım Detayı</span>
        <div className={styles.barActions}>
          <Link href={`/teams/${teamId}`} className={styles.fullLink}>
            Detaylı Görünüm ↗
          </Link>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Detay panelini kapat">
            ✕
          </button>
        </div>
      </header>
      <div className={styles.scroll} ref={scrollRef}>
        <TeamDetailView key={teamId} teamId={teamId} variant="panel" />
      </div>
    </section>
  );
}
