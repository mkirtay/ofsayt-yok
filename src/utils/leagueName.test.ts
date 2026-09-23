import { describe, expect, it } from 'vitest';
import { leagueDisplayName, leagueSearchTerms } from './leagueName';
import { COMPARE_LEAGUE_GROUPS, SIDEBAR_LEAGUES, UEFA_SIDEBAR_LEAGUES } from '@/config/leagues';
import trLeagues from '../../public/locales/tr/leagues.json';
import enLeagues from '../../public/locales/en/leagues.json';

const ALL_LEAGUES = [
  ...SIDEBAR_LEAGUES,
  ...UEFA_SIDEBAR_LEAGUES,
  ...COMPARE_LEAGUE_GROUPS.flatMap((g) => g.leagues),
];

/** `lib/i18n`'deki `t` davranışı: anahtar yoksa anahtarın kendisini döner. */
const translator = (dict: Record<string, string>) => (key: string) => dict[key] ?? key;

describe('lig adı çeviri kataloğu', () => {
  it('her `nameKey` hem tr hem en sözlüğünde var', () => {
    for (const l of ALL_LEAGUES) {
      expect(trLeagues, `tr: ${l.nameKey}`).toHaveProperty(l.nameKey);
      expect(enLeagues, `en: ${l.nameKey}`).toHaveProperty(l.nameKey);
    }
  });

  it('tr ve en aynı anahtar kümesine sahip (artık/eksik çeviri yok)', () => {
    expect(Object.keys(trLeagues).sort()).toEqual(Object.keys(enLeagues).sort());
  });

  it('hiçbir çeviri boş değil', () => {
    for (const dict of [trLeagues, enLeagues]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
      }
    }
  });
});

describe('leagueDisplayName', () => {
  it('seçili dilin adını döner', () => {
    const cl = UEFA_SIDEBAR_LEAGUES[0];
    expect(leagueDisplayName(cl, translator(trLeagues))).toBe('Şampiyonlar Ligi');
    expect(leagueDisplayName(cl, translator(enLeagues))).toBe('UEFA Champions League');
  });

  it('anahtar sözlükte yoksa config adına düşer (anahtarı ekranda göstermez)', () => {
    const league = { nameKey: 'yokBoyleBirLig', name: 'Yedek Ad' };
    expect(leagueDisplayName(league, translator({}))).toBe('Yedek Ad');
  });

  it('nameKey boşsa config adını kullanır', () => {
    expect(leagueDisplayName({ nameKey: '', name: 'Yedek Ad' }, translator(trLeagues))).toBe('Yedek Ad');
  });
});

describe('leagueSearchTerms', () => {
  it('çeviri config adından farklıysa ikisini birden arar', () => {
    const pl = SIDEBAR_LEAGUES.find((l) => l.nameKey === 'premierLeague')!;
    const terms = leagueSearchTerms(pl, translator(enLeagues));
    expect(terms).toContain('Premier League');
    expect(terms).toContain('İngiltere Premier Lig');
  });

  it('çeviri config adıyla aynıysa tekrar etmez', () => {
    const superLig = SIDEBAR_LEAGUES[0];
    expect(leagueSearchTerms(superLig, translator(trLeagues))).toBe(superLig.name);
  });
});
