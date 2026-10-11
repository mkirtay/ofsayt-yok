import type { PendingSummary } from '@/hooks/useBotDrafts';
import styles from './adminBotQueue.module.scss';

export const BULK_KIND_LABEL: Record<string, string> = { GOAL: 'Gol', PREVIEW: 'Maç öncesi', RECAP: 'Maç sonu' };

type Props = {
  /** Sayfadaki seçili bekleyen taslak sayısı. */
  selectedCount: number;
  /** Sayfadaki bekleyen taslak sayısı (hepsini seç/bırak düğmesi için). */
  pageCount: number;
  summary: PendingSummary | undefined;
  kind: string;
  league: string;
  busy?: boolean;
  onKind: (kind: string) => void;
  onLeague: (league: string) => void;
  onToggleAll: () => void;
  onRejectSelected: () => void;
  onRejectAll: () => void;
  onRejectFiltered: () => void;
};

/** "Bekliyor" sekmesi toplu işlemleri (görünüm): seçilenleri reddet · tümünü reddet · tür/lig filtresine göre reddet. */
export default function BulkToolbar({
  selectedCount, pageCount, summary, kind, league, busy = false, onKind, onLeague, onToggleAll, onRejectSelected, onRejectAll, onRejectFiltered,
}: Props) {
  const total = summary?.total;
  const filtered = Boolean(kind || league);
  return (
    <section className={styles.bulk} aria-label="Toplu işlemler">
      <div className={styles.bulkRow}>
        <button type="button" className={styles.secondary} disabled={busy || pageCount === 0} onClick={onToggleAll}>
          {selectedCount === pageCount && pageCount > 0 ? 'Seçimi kaldır' : 'Sayfadakileri seç'}
        </button>
        <button type="button" className={styles.danger} disabled={busy || selectedCount === 0} onClick={onRejectSelected}>
          Seçilenleri reddet ({selectedCount})
        </button>
        <button type="button" className={styles.danger} disabled={busy || !total} onClick={onRejectAll}>
          Tümünü reddet{total != null ? ` (${total})` : ''}
        </button>
      </div>
      <div className={styles.bulkRow}>
        <select className={styles.bulkSelect} aria-label="Tür" value={kind} disabled={busy} onChange={(e) => onKind(e.target.value)}>
          <option value="">Tüm türler</option>
          {(summary?.kinds ?? []).map((k) => (
            <option key={k.kind} value={k.kind}>
              {BULK_KIND_LABEL[k.kind] ?? k.kind} ({k.count})
            </option>
          ))}
        </select>
        <select className={styles.bulkSelect} aria-label="Lig" value={league} disabled={busy} onChange={(e) => onLeague(e.target.value)}>
          <option value="">Tüm ligler</option>
          {(summary?.leagues ?? []).map((l) => (
            <option key={l.name} value={l.name}>
              {l.name} ({l.count})
            </option>
          ))}
        </select>
        <button type="button" className={styles.danger} disabled={busy || !filtered} onClick={onRejectFiltered}>
          Filtreye göre reddet
        </button>
      </div>
    </section>
  );
}
