import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useDeletePost, useTogglePostLike } from '@/hooks/useGundem';

/**
 * Feed ve detay panelinin ortak post eylemleri (beğeni + silme) ve "ben kimim" bilgisi.
 * Silme yetkisi burada yalnızca GÖRÜNÜRLÜK içindir; sunucu sahip/ADMIN'i DB'den yeniden doğrular.
 * Silme onayı `window.confirm` yerine stilize `ConfirmDialog` ile alınır: dönen `confirmDialog` düğümü çağıran bileşende render edilmelidir.
 */
export function usePostActions() {
  const { t } = useTranslation('gundem');
  const { data: session } = useSession();
  const like = useTogglePostLike();
  const del = useDeletePost();
  const { ask, dialog } = useConfirmDialog();
  const currentUserId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === 'ADMIN';

  return {
    currentUserId,
    isAdmin,
    likingId: like.isPending ? like.variables : null,
    deletingId: del.isPending ? del.variables : null,
    toggleLike: (postId: string) => {
      if (!currentUserId || like.isPending) return;
      like.mutate(postId);
    },
    /** Onay modalını açar; onaylanınca siler, başarıda `onDeleted` (ör. paneli kapat). Hata → modalda mesaj, modal açık kalır. */
    remove: (postId: string, onDeleted?: () => void) => {
      if (del.isPending) return;
      ask({
        title: t('post.deleteTitle'),
        message: t('post.confirmDelete'),
        confirmLabel: t('dialog.delete'),
        cancelLabel: t('dialog.cancel'),
        errorMessage: t('post.deleteError'),
        onConfirm: async () => {
          await del.mutateAsync(postId);
          onDeleted?.();
        },
      });
    },
    confirmDialog: dialog,
  };
}
