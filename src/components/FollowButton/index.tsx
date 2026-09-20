import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useToggleFollow } from '@/hooks/useGundem';
import { useTranslation } from '@/lib/i18n';
import styles from './followButton.module.scss';

export type FollowButtonProps = {
  userId: string;
  /** Oturum sahibi bu kullanıcıyı takip ediyor mu (`author.followedByMe`). */
  following: boolean;
  className?: string;
};

/**
 * Takip düğmesi (basit toggle, `aria-pressed`). İstek sürerken pasif; oturumsuzken tıklama giriş sayfasına yönlendirir
 * (dönüşte bu sayfaya geri gelinir). Kendi hesabında hiç render edilmez. Sonuç cache'e `useToggleFollow` ile yerinde işlenir.
 */
export default function FollowButton({ userId, following, className }: FollowButtonProps) {
  const { t } = useTranslation('gundem');
  const router = useRouter();
  const { data: session, status } = useSession();
  const toggle = useToggleFollow();

  if (session?.user?.id === userId) return null;

  function onClick() {
    if (status === 'loading' || toggle.isPending) return;
    if (status === 'unauthenticated') {
      void router.push(`/auth/signin?callbackUrl=${encodeURIComponent(router.asPath)}`);
      return;
    }
    toggle.mutate(userId);
  }

  return (
    <button
      type="button"
      className={[styles.btn, following ? styles.active : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={following}
    >
      {following ? t('follow.following') : t('follow.follow')}
    </button>
  );
}
