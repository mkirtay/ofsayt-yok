// Sayfaya özel TR namespace: kullanan modülden yan etkiyle kaydedilir (bkz. lib/i18nRegistry.ts). Gündem moderasyonu
// (şikâyet, engelleme, etiket önerisi) bileşenleri tembel yüklenir → bu sözlük ana sayfanın ilk yüküne girmez.
import { registerNamespace } from '@/lib/i18nRegistry';
import tr from '../../../public/locales/tr/moderation.json';

registerNamespace('tr', 'moderation', tr);
