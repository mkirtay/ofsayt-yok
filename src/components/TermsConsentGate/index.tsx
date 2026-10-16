import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { LEGAL_PAGES } from '@/config/legalPages';

/** Tarayıcı oturumu başına bir kez yönlendirilir ("Şimdi değil" diyen tekrar tekrar sayfaya itilmez). */
export const TERMS_PROMPT_STORAGE_KEY = 'oy_terms_prompted_v1';

// Hesap silme sayfaları da muaf: hesabını silmek isteyen onay ekranına yönlendirilmez.
const EXEMPT_PATHS = new Set<string>([...LEGAL_PAGES.map((p) => p.path), '/iletisim', '/hesap-silme', '/hesap-silme/onay']);

/**
 * Onay sayfasına yönlendirilmeli mi (saf — test edilebilir): oturum açık, onay kesin olarak YOK (bilinmiyorsa —
 * eski belirteç — yönlendirme yok), bu oturumda henüz sorulmadı ve sayfa giriş / onay / yasal metin sayfası değil.
 */
export function shouldPromptTerms(input: {
  status: 'authenticated' | 'unauthenticated' | 'loading';
  termsAccepted: boolean | undefined;
  pathname: string;
  alreadyPrompted: boolean;
}): boolean {
  if (input.status !== 'authenticated' || input.termsAccepted !== false || input.alreadyPrompted) return false;
  const p = input.pathname;
  // /odeme/*: ödeme dönüşü (adres temizliği ve sipariş yoklaması bölünmesin; satın alma zaten onay ister).
  if (p.startsWith('/auth/') || p.startsWith('/admin') || p.startsWith('/odeme/') || p === '/404' || p === '/500' || p === '/_error') return false;
  return !EXEMPT_PATHS.has(p);
}

function readPrompted(): boolean {
  try {
    return window.sessionStorage.getItem(TERMS_PROMPT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markPrompted(): void {
  try {
    window.sessionStorage.setItem(TERMS_PROMPT_STORAGE_KEY, '1');
  } catch {
    // Depolama kapalı (gizli pencere vb.): yine de bu sayfa yüklemesinde bir kez yönlendirilir.
  }
}

/**
 * Google ile ilk giriş ve onayı kayıtlı olmayan eski hesaplar: oturum başına bir kez /auth/onay'a yönlendirir, sonra
 * kullanıcı serbestçe gezer (kilitleme yok; yazma uçları 403 TERMS_REQUIRED ile kendi bağlantısını gösterir). Görsel yok.
 */
export default function TermsConsentGate() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const termsAccepted = session?.user?.termsAccepted;

  useEffect(() => {
    if (!router.isReady) return;
    if (!shouldPromptTerms({ status, termsAccepted, pathname: router.pathname, alreadyPrompted: readPrompted() })) return;
    markPrompted();
    void router.replace(`/auth/onay?callbackUrl=${encodeURIComponent(router.asPath)}`);
  }, [router, status, termsAccepted]);

  return null;
}
