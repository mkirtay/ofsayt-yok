// Sayfaya özel TR namespace: kullanan modülden yan etkiyle kaydedilir (bkz. lib/i18nRegistry.ts).
import { registerNamespace } from '@/lib/i18nRegistry';
import tr from '../../../public/locales/tr/kuralKosesi.json';

registerNamespace('tr', 'kuralKosesi', tr);
