import { useI18n } from '@/lib/i18n';
import { withBrandText } from '@/config/brand';
import tr from '../../../public/locales/tr/accountDeletion.json';
import en from '../../../public/locales/en/accountDeletion.json';

/**
 * /hesap-silme metinleri: yasal sayfalar gibi JSON doğrudan import edilir (iki dil birkaç KB, yalnız bu sayfaların
 * parçasında) → TR ve EN, i18n kayıt sistemine girmeden; marka değişkenleri burada dolar. Yer tutucular
 * (`[AVUKAT ONAYLI SÜRE]`, `[ŞİRKET/KİŞİ ÜNVANI]`) bilerek olduğu gibi kalır.
 */
const TEXT = { tr: withBrandText(tr), en: withBrandText(en) };

export type AccountDeletionText = typeof TEXT.tr;

export function useAccountDeletionText(): { text: AccountDeletionText; locale: 'tr' | 'en' } {
  const { locale } = useI18n();
  return locale === 'en' ? { text: TEXT.en, locale: 'en' } : { text: TEXT.tr, locale: 'tr' };
}

/** Giriş yapabilen kullanıcı için profil silme bölümü (DeleteAccountSection `id`). */
export const PROFILE_DELETE_HREF = '/profile#hesabi-sil';
export const ACCOUNT_DELETION_PATH = '/hesap-silme';
