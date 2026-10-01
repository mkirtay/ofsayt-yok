// Maç detayına özel TR namespace (maç evresi/özel durum metinleri, kadro başlıkları): kullanan modülden yan etkiyle
// kaydedilir (bkz. lib/i18nRegistry.ts) — ana sayfanın ilk yüküne girmez.
import { registerNamespace } from '@/lib/i18nRegistry';
import tr from '../../../public/locales/tr/matchState.json';

registerNamespace('tr', 'matchState', tr);
