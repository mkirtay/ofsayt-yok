// Eleme ağacı namespace'i: yalnız tembel yüklenen CupBracket bileşeninden yan etkiyle kaydedilir (bkz. lib/i18nRegistry.ts).
// EN de burada (i18nEnglish.ts'e eklenmedi): sözlük küçük ve yalnız sekme açılınca inen parçada.
import { registerNamespace } from '@/lib/i18nRegistry';
import tr from '../../../public/locales/tr/cupBracket.json';
import en from '../../../public/locales/en/cupBracket.json';

registerNamespace('tr', 'cupBracket', tr);
registerNamespace('en', 'cupBracket', en);
