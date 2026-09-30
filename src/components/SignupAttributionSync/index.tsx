import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { captureSessionAttribution, sendSessionAttributionOnce } from '@/lib/signupAttributionClient';

/**
 * Kayıt kaynağı (ilk temas): oturumun ilk sayfasında utm_* + zamanı sessionStorage'a yazar; oturum açılınca
 * bir kez `/api/user/attribution`'a gönderir (Google ile kayıt; sunucu yalnız yeni hesaba yazar). Görsel yok.
 */
export default function SignupAttributionSync() {
  const { status } = useSession();

  useEffect(() => {
    captureSessionAttribution();
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void sendSessionAttributionOnce();
  }, [status]);

  return null;
}
