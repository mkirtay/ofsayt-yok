/** @type {import('next-i18next').UserConfig} */
module.exports = {
  i18n: {
    defaultLocale: 'tr',
    locales: ['tr', 'en'],
  },
  ns: ['common', 'nav', 'auth', 'premium', 'match', 'standings', 'profile', 'ai'],
  defaultNS: 'common',
  reloadOnPrerender: process.env.NODE_ENV === 'development',
};
