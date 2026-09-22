import { useState } from 'react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import { BotDraftApiError, useBotDraftActions, useBotDrafts, type BotDraftFilter } from '@/hooks/useBotDrafts';
import BotDraftCard, { STATUS_LABEL } from './BotDraftCard';
import styles from './adminBotQueue.module.scss';

const FILTERS: BotDraftFilter[] = ['PENDING', 'POSTED', 'REJECTED', 'STALE', 'all'];

/** Gündem resmi hesap botu onay kuyruğu (yalnızca ADMIN). Otomatik yayın yok: her gönderi burada elle onaylanır. */
export default function AdminBotQueue() {
  const [filter, setFilter] = useState<BotDraftFilter>('PENDING');
  const drafts = useBotDrafts(filter);
  const { edit, approve, reject } = useBotDraftActions();
  const { ask, dialog } = useConfirmDialog();
  const [notice, setNotice] = useState<string | null>(null);
  const busy = edit.isPending || approve.isPending || reject.isPending;

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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Gündem onay kuyruğu</h1>
      <p className={styles.lead}>Bot gol taslaklarını dakikada bir üretir; hiçbiri otomatik yayınlanmaz.</p>

      <div className={styles.filters} role="tablist" aria-label="Durum">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`.trim()}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Tümü' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

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
            />
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
