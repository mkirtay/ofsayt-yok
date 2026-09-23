/**
 * Sportmonks `league_id` → `leagues` i18n namespace'indeki kısa ad anahtarı (`short.<key>`).
 *
 * TEK KAYNAK: web arayüzü (`utils/leagueName.ts` → `leagueNameById`) ve Gündem botu
 * (`lib/gundem/bot/leagueNames.ts`, Faz D) aynı eşlemeyi kullanır. Mobil uygulama da bu tabloyu birebir taklit eder.
 * id'ler `sportmonksProviderFlag.ts` VERIFIED_LEGACY_TO_SPORTMONKS_LEAGUE_ID ile doğrulanmış id'lerdir.
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
};
