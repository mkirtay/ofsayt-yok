import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leagueDisplayName, leagueNameById, leagueSearchTerms } from './leagueName';
import { SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';
import { COMPARE_LEAGUE_GROUPS, SIDEBAR_LEAGUES, UEFA_SIDEBAR_LEAGUES } from '@/config/leagues';
import trLeagues from '../../public/locales/tr/leagues.json';
import enLeagues from '../../public/locales/en/leagues.json';

const ALL_LEAGUES = [
  ...SIDEBAR_LEAGUES,
  ...UEFA_SIDEBAR_LEAGUES,
  ...COMPARE_LEAGUE_GROUPS.flatMap((g) => g.leagues),
];

/** `lib/i18n`'deki `t` davranışı: noktalı anahtar iç içe çözülür; yoksa anahtarın kendisini döner. */
const translator = (dict: Record<string, unknown>) => (key: string) => {
  const v = key.split('.').reduce<unknown>((cur, p) => (cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[p] : undefined), dict);
  return typeof v === 'string' ? v : key;
};

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
      const { short, ...flat } = dict;
      for (const [k, v] of [...Object.entries(flat), ...Object.entries(short).map(([sk, sv]) => [`short.${sk}`, sv])]) {
        expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
      }
    }
  });
});

describe('leagueDisplayName', () => {
  it('seçili dilin KISA adını döner (leagueNameById ile aynı `short.*` tablosu)', () => {
    const cl = UEFA_SIDEBAR_LEAGUES[0];
    expect(leagueDisplayName(cl, translator(trLeagues))).toBe('Şampiyonlar Ligi');
    expect(leagueDisplayName(cl, translator(enLeagues))).toBe('Champions League');
    const superLig = SIDEBAR_LEAGUES[0];
    expect(leagueDisplayName(superLig, translator(trLeagues))).toBe('Süper Lig');
    expect(leagueDisplayName(superLig, translator(enLeagues))).toBe('Süper Lig');
  });

  it('kısa ad yoksa uzun çeviriye düşer', () => {
    const league = { nameKey: 'superLig', name: 'Yedek Ad' };
    expect(leagueDisplayName(league, translator({ superLig: 'Uzun Ad' }))).toBe('Uzun Ad');
  });

  it('config ligi ile Sportmonks id\'si aynı kısa adı verir', () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true');
    try {
      for (const dict of [trLeagues, enLeagues]) {
        expect(leagueDisplayName(SIDEBAR_LEAGUES[0], translator(dict))).toBe(leagueNameById(600, 'Super Lig', translator(dict)));
      }
    } finally {
      vi.unstubAllEnvs();
    }
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
    const turkishCup = { nameKey: 'turkishCup', name: 'Türkiye Kupası' };
    expect(leagueSearchTerms(turkishCup, translator(trLeagues))).toBe('Türkiye Kupası');
  });

  it('kısa ad gösterilse de sponsorlu uzun adla da bulunur', () => {
    const terms = leagueSearchTerms(SIDEBAR_LEAGUES[0], translator(trLeagues));
    expect(terms).toContain('Süper Lig');
    expect(terms).toContain('Trendyol');
  });
});

describe('leagueNameById (Sportmonks league_id → kısa ad)', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('tr: ham API adı yerine Türkçe kısa ad', () => {
    const t = translator(trLeagues);
    expect(leagueNameById(600, 'Super Lig', t)).toBe('Süper Lig');
    expect(leagueNameById(2, 'Champions League', t)).toBe('Şampiyonlar Ligi');
    expect(leagueNameById('564', 'La Liga', t)).toBe('La Liga');
  });

  it('en: İngilizce ad', () => {
    const t = translator(enLeagues);
    expect(leagueNameById(600, 'Super Lig', t)).toBe('Süper Lig');
    expect(leagueNameById(2, 'Champions League', t)).toBe('Champions League');
    expect(leagueNameById(606, 'Turkish Cup', t)).toBe('Turkish Cup');
  });

  it('eşlemesi olmayan lig / id yok → API adı (sessiz yedek)', () => {
    const t = translator(trLeagues);
    expect(leagueNameById(567, 'La Liga 2', t)).toBe('La Liga 2');
    expect(leagueNameById(undefined, ' Major League Soccer ', t)).toBe('Major League Soccer');
    expect(leagueNameById(600, undefined, translator({}))).toBe('');
  });

  it('Sportmonks kapalıyken (legacy id: 2 = Premier Lig) eşleme yapılmaz', () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'false');
    expect(leagueNameById(2, 'Premier League', translator(trLeagues))).toBe('Premier League');
  });

  it('eşlemedeki her anahtarın tr ve en kısa adı var', () => {
    for (const key of Object.values(SPORTMONKS_LEAGUE_NAME_KEYS)) {
      expect(trLeagues.short, `tr short.${key}`).toHaveProperty(key);
      expect(enLeagues.short, `en short.${key}`).toHaveProperty(key);
    }
  });
});
