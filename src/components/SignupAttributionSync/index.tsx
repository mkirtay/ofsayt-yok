import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { captureSessionAttribution, sendSessionAttributionOnce } from '@/lib/signupAttributionClient';
import { markRegistrationCompleted } from '@/lib/metaPixel';

/**
 * Kayıt kaynağı (ilk temas): oturumun ilk sayfasında utm_* + zamanı sessionStorage'a yazar; oturum açılınca
 * bir kez `/api/user/attribution`'a gönderir (Google ile kayıt; sunucu yalnız yeni hesaba yazar). Sunucu yazdıysa (yeni
 * hesap) Meta Pixel için CompleteRegistration bekletilir — onay varsa MetaPixel gönderir, kişisel veri yok. Görsel yok.
 */
export default function SignupAttributionSync() {
  const { status } = useSession();

  useEffect(() => {
    captureSessionAttribution();
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void sendSessionAttributionOnce().then((isNew) => {
      if (isNew) markRegistrationCompleted();
    });
  }, [status]);

  return null;
}
