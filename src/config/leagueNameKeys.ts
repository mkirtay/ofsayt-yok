/**
 * Sportmonks `league_id` → `leagues` i18n namespace'indeki kısa ad anahtarı (`short.<key>`).
 *
 * TEK KAYNAK: web arayüzü (`utils/leagueName.ts` → `leagueNameById`) ve Gündem botu
 * (`lib/gundem/bot/leagueNames.ts`, Faz D) aynı eşlemeyi kullanır. Mobil uygulama da bu tabloyu birebir taklit eder.
 * id'ler `sportmonksProviderFlag.ts` VERIFIED_LEGACY_TO_SPORTMONKS_LEAGUE_ID ile doğrulanmış id'lerdir;
 * 2026-09-30'dan beri planımızdaki 34 ligin TAMAMI (`config/__fixtures__/accessibleLeagues.json`) burada — aynı adı taşıyan
 * ligler (Super League, Pro League, Premier League, Serie A) ülke ön ekiyle ayrışır.
 * Eşlemesi olmayan lig → API adı (uydurma ad yok).
 */
export const SPORTMONKS_LEAGUE_NAME_KEYS: Readonly<Record<number, string>> = {
  600: 'superLig',
  603: 'tffFirstLeague',
  606: 'turkishCup',
  8: 'premierLeague',
  82: 'bundesliga',
  564: 'laLiga',
  384: 'serieA',
  301: 'ligue1',
  2: 'championsLeague',
  5: 'europaLeague',
  2286: 'conferenceLeague',
  9: 'championship',
  72: 'eredivisie',
  85: 'bundesliga2',
  208: 'belgiumProLeague',
  262: 'czechLiga',
  271: 'denmarkSuperliga',
  304: 'ligue2',
  325: 'greeceSuperLeague',
  387: 'serieB',
  462: 'ligaPortugal',
  501: 'scotlandPremiership',
  567: 'laLiga2',
  570: 'copaDelRey',
  573: 'allsvenskan',
  591: 'switzerlandSuperLeague',
  609: 'ukrainePremier',
  636: 'argentinaLiga',
  648: 'brazilSerieA',
  779: 'mls',
  944: 'saudiProLeague',
  1282: 'secondLeagueWhite',
  1283: 'secondLeagueRed',
  1328: 'uefaSuperCup',
};
