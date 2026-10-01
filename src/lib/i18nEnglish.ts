/**
 * İngilizce sözlüklerin tamamı — yalnız dil EN seçiliyken dinamik import edilir (bkz. `lib/i18n.tsx`), TR kullanıcı
 * hiç indirmez. `legal` yok: hukuk sayfaları kendi JSON'unu doğrudan import ediyor.
 */
import { registerNamespace } from '@/lib/i18nRegistry';
import common from '../../public/locales/en/common.json';
import nav from '../../public/locales/en/nav.json';
import auth from '../../public/locales/en/auth.json';
import credits from '../../public/locales/en/credits.json';
import match from '../../public/locales/en/match.json';
import leagues from '../../public/locales/en/leagues.json';
import player from '../../public/locales/en/player.json';
import compare from '../../public/locales/en/compare.json';
import standings from '../../public/locales/en/standings.json';
import profile from '../../public/locales/en/profile.json';
import ai from '../../public/locales/en/ai.json';
import gundem from '../../public/locales/en/gundem.json';
import team from '../../public/locales/en/team.json';

const EN = { common, nav, auth, credits, match, leagues, player, compare, standings, profile, ai, gundem, team };

for (const [ns, dict] of Object.entries(EN)) registerNamespace('en', ns, dict);
