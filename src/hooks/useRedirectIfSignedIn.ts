import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { signedInRedirectPath } from '@/lib/authRedirect';

/** Giriş / kayıt sayfaları: oturum zaten açıksa `callbackUrl`'e (yoksa ana sayfaya) gönderir (geçmişe eklemeden). */
export function useRedirectIfSignedIn(): void {
  const router = useRouter();
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'authenticated' || !router.isReady) return;
    void router.replace(signedInRedirectPath(router.query.callbackUrl));
  }, [status, router]);
}
