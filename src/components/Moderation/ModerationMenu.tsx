import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { REPORT_REVIEW_HOURS } from '@/config/moderation';
import { GundemApiError } from '@/hooks/useGundem';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/moderation';
import ReportDialog from './ReportDialog';
import { reportContent, setUserBlocked, type ReportTargetType } from './api';
import styles from './moderation.module.scss';

export type ModerationMenuProps = {
  open: boolean;
  onClose: () => void;
  /** "⋯" düğmesi: dış tık kontrolü ve Esc ile odak dönüşü. */
  anchorRef: RefObject<HTMLElement | null>;
  targetType: ReportTargetType;
  targetId: string;
  /** Engelleme hedefi (yazar). Silinmiş kullanıcı / resmi hesapta null → yalnız şikâyet. */
  blockTarget: { id: string; name: string } | null;
  /** Profil sayfasında engel durumu bilinir; akışta görünen yazar zaten engellenmemiştir. */
  blocked?: boolean;
  onBlockedChange?: (blocked: boolean) => void;
};

/**
 * Gönderi / yorum / profil "⋯" menüsü (tembel yüklenir: MoreButton tıklanınca). Şikâyet et → ReportDialog; Kullanıcıyı
 * engelle → onay → POST /block (akış, yorum ve bildirim sorguları yenilenir; sunucu zaten süzer). Sonuç: toast.
 * Klavye: açılınca ilk öğe odakta, ↑/↓ öğeler arası, Esc / dış tık kapatır (odak düğmeye döner).
 */
export default function ModerationMenu({ open, onClose, anchorRef, targetType, targetId, blockTarget, blocked = false, onBlockedChange }: ModerationMenuProps) {
  const { t } = useTranslation('moderation');
  const qc = useQueryClient();
  const menuRef = useRef<HTMLDivElement>(null);
  const { ask, dialog } = useConfirmDialog();
  const { show, toastNode } = useToast(t('toast.close'));
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    items()[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
      } else if (e.key === 'Tab') {
        onClose();
      }
    }
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, anchorRef]);

  function reportMessage(e: unknown): string {
    if (e instanceof GundemApiError) {
      if (e.status === 401) return t('report.loginRequired');
      if (e.status === 429) return t('report.rateLimited');
      if (e.code === 'CANNOT_REPORT_SELF') return t('report.self');
      if (e.status === 404) return t('report.notFound');
    }
    return t('report.error');
  }

  async function submitReport(reason: string, note: string) {
    setBusy(true);
    setReportError(null);
    try {
      const r = await reportContent({ targetType, targetId, reason, ...(note ? { note } : {}) });
      setReporting(false);
      show('success', r.duplicate ? t('report.duplicate') : t('report.done', { hours: REPORT_REVIEW_HOURS }));
    } catch (e) {
      setReportError(reportMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleBlock() {
    if (!blockTarget) return;
    onClose();
    if (blocked) {
      void setUserBlocked(blockTarget.id, false)
        .then(() => {
          onBlockedChange?.(false);
          show('success', t('block.undone', { name: blockTarget.name }));
          return qc.invalidateQueries({ queryKey: ['gundem'] });
        })
        .catch(() => show('error', t('block.error')));
      return;
    }
    ask({
      title: t('block.confirmTitle', { name: blockTarget.name }),
      message: t('block.confirmBody'),
      confirmLabel: t('block.confirm'),
      cancelLabel: t('block.cancel'),
      errorMessage: t('block.error'),
      onConfirm: async () => {
        await setUserBlocked(blockTarget.id, true);
        onBlockedChange?.(true);
        show('success', t('block.done', { name: blockTarget.name }));
        await qc.invalidateQueries({ queryKey: ['gundem'] });
      },
    });
  }

  return (
    <>
      {open ? (
        <div ref={menuRef} className={styles.menu} role="menu" aria-label={t('menu.label')}>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onClose();
              setReportError(null);
              setReporting(true);
            }}
          >
            {t('menu.report')}
          </button>
          {blockTarget ? (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={toggleBlock}>
              {blocked ? t('menu.unblock') : t('menu.block')}
            </button>
          ) : null}
        </div>
      ) : null}
      {reporting ? (
        <ReportDialog
          targetType={targetType}
          busy={busy}
          error={reportError}
          onSubmit={(reason, note) => void submitReport(reason, note)}
          onCancel={() => setReporting(false)}
        />
      ) : null}
      {dialog}
      {toastNode}
    </>
  );
}
