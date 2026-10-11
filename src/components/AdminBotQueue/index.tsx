import { useState } from 'react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import {
  BotDraftApiError,
  useBotDraftActions,
  useBotDrafts,
  useBulkReject,
  usePendingSummary,
  type BotDraftFilter,
  type BulkSelector,
} from '@/hooks/useBotDrafts';
import BotDraftCard, { STATUS_LABEL } from './BotDraftCard';
import BulkToolbar, { BULK_KIND_LABEL } from './BulkToolbar';
import styles from './adminBotQueue.module.scss';

const FILTERS: BotDraftFilter[] = ['PENDING', 'POSTED', 'REJECTED', 'STALE', 'all'];

/** Gündem resmi hesap botu onay kuyruğu (yalnızca ADMIN). Otomatik yayın yok: her gönderi burada elle onaylanır. */
export default function AdminBotQueue() {
  const [filter, setFilter] = useState<BotDraftFilter>('PENDING');
  const drafts = useBotDrafts(filter);
  const { edit, approve, reject } = useBotDraftActions();
  const { ask, dialog } = useConfirmDialog();
  const [notice, setNotice] = useState<string | null>(null);
  const bulk = useBulkReject();
  const busy = edit.isPending || approve.isPending || reject.isPending || bulk.run.isPending;
  const pendingTab = filter === 'PENDING';
  const summary = usePendingSummary(pendingTab);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState('');
  const [bulkLeague, setBulkLeague] = useState('');

  const errorOf = (e: unknown) => (e instanceof BotDraftApiError ? e.message : 'Beklenmeyen hata.');

  function onApprove(id: string) {
    ask({
      title: 'Yayınla',
      message: 'Bu gönderi resmi hesap adına herkese açık yayınlanacak. Yayından önce gol Sportmonks üzerinden yeniden doğrulanır.',
      confirmLabel: 'Yayınla',
      cancelLabel: 'Vazgeç',
      errorMessage: 'Yayınlanamadı.',
      onConfirm: async () => {
        setNotice(null);
        try {
          await approve.mutateAsync(id);
        } catch (e) {
          // Diyalog yalnızca sabit metin gösterir; asıl neden (ör. VAR nedeniyle eskidi) sayfada gösterilir.
          setNotice(errorOf(e));
        }
      },
    });
  }

  function onReject(id: string) {
    ask({
      title: 'Reddet',
      message: 'Taslak reddedilecek ve yayınlanmayacak.',
      confirmLabel: 'Reddet',
      cancelLabel: 'Vazgeç',
      errorMessage: 'Reddedilemedi.',
      onConfirm: () => reject.mutateAsync(id),
    });
  }

  const items = drafts.data?.items ?? [];
  const pageIds = items.filter((d) => d.status === 'PENDING').map((d) => d.id);
  // Seçim yalnızca görünen bekleyen kartlara uygulanır (kart listeden düşmüşse sayılmaz/gönderilmez).
  const selectedIds = pageIds.filter((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Onay penceresi: etkilenecek sayı dry-run ile sunucudan alınır (seçili kimliklerde yalnız hâlâ PENDING olanlar sayılır). */
  async function confirmBulk(selector: BulkSelector, title: string, describe: (n: number) => string) {
    setNotice(null);
    let n: number;
    try {
      n = await bulk.count(selector);
    } catch (e) {
      setNotice(errorOf(e));
      return;
    }
    if (n === 0) {
      setNotice('Reddedilecek bekleyen taslak yok.');
      return;
    }
    ask({
      title,
      message: `${describe(n)} Silinmez; durumları "Reddedildi" olur. Yayınlanmış taslaklara dokunulmaz.`,
      confirmLabel: `${n} taslağı reddet`,
      cancelLabel: 'Vazgeç',
      errorMessage: 'Toplu ret başarısız.',
      onConfirm: async () => {
        const r = await bulk.run.mutateAsync(selector);
        setSelected(new Set());
        setNotice(`${r.rejected} taslak reddedildi${r.skipped ? ` (${r.skipped} tanesi artık bekleyen değildi, dokunulmadı)` : ''}.`);
      },
    });
  }

  const filterLabel = [bulkKind ? (BULK_KIND_LABEL[bulkKind] ?? bulkKind) : null, bulkLeague || null].filter(Boolean).join(' · ');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Gündem onay kuyruğu</h1>
      <p className={styles.lead}>Gol taslağı üretimi varsayılan olarak kapalıdır (GUNDEM_BOT_GOALS_ENABLED=1 ile açılır; açıkken dakikada bir üretir). Hiçbir taslak otomatik yayınlanmaz.</p>

      <div className={styles.filters} role="tablist" aria-label="Durum">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`.trim()}
            onClick={() => {
              setFilter(f);
              setSelected(new Set());
            }}
          >
            {f === 'all' ? 'Tümü' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {pendingTab ? (
        <BulkToolbar
          selectedCount={selectedIds.length}
          pageCount={pageIds.length}
          summary={summary.data}
          kind={bulkKind}
          league={bulkLeague}
          busy={busy}
          onKind={setBulkKind}
          onLeague={setBulkLeague}
          onToggleAll={() => setSelected(selectedIds.length === pageIds.length ? new Set() : new Set(pageIds))}
          onRejectSelected={() =>
            void confirmBulk({ ids: selectedIds }, 'Seçilenleri reddet', (n) => `Seçili ${n} bekleyen taslak reddedilecek.`)
          }
          onRejectAll={() => void confirmBulk({ all: true }, 'Tümünü reddet', (n) => `Bekleyen TÜM taslaklar (${n} adet) reddedilecek.`)}
          onRejectFiltered={() =>
            void confirmBulk(
              { ...(bulkKind ? { kind: bulkKind } : {}), ...(bulkLeague ? { league: bulkLeague } : {}) },
              'Filtreye göre reddet',
              (n) => `Filtreye uyan (${filterLabel}) ${n} bekleyen taslak reddedilecek.`,
            )
          }
        />
      ) : null}

      {notice ? (
        <p className={styles.error} role="alert">
          {notice}
        </p>
      ) : null}
      {edit.isError ? <p className={styles.error}>{errorOf(edit.error)}</p> : null}

      {drafts.isPending ? (
        <EmptyState>Yükleniyor…</EmptyState>
      ) : drafts.isError ? (
        <EmptyState>
          {errorOf(drafts.error)}{' '}
          <button type="button" className={styles.link} onClick={() => void drafts.refetch()}>
            Tekrar dene
          </button>
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>Bu durumda taslak yok.</EmptyState>
      ) : (
        <div className={styles.list}>
          {items.map((d) => (
            <BotDraftCard
              key={`${d.id}:${d.body}`}
              draft={d}
              busy={busy}
              onSave={(id, body) => edit.mutate({ id, body })}
              onApprove={onApprove}
              onReject={onReject}
              selected={selected.has(d.id)}
              onToggleSelect={toggle}
            />
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
