import { describe, expect, it } from 'vitest';
import trLeagues from '../../public/locales/tr/leagues.json';
import enLeagues from '../../public/locales/en/leagues.json';
import { PLAN_SPORTMONKS_LEAGUE_IDS } from '@/config/leagueNameKeys';
import { buildHubLeagueGroups, filterHubLeagueGroups, HUB_LEAGUE_GROUP_ORDER, HUB_LEAGUE_IDS } from './hubLeagueGroups';

/** `useTranslation('leagues').t` taklidi: noktalı anahtar, yoksa anahtarın kendisi. */
function translator(dict: Record<string, unknown>) {
  return (key: string) => {
    const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);
    return typeof v === 'string' ? v : key;
  };
}
const trT = translator(trLeagues);
const enT = translator(enLeagues);
const tr = buildHubLeagueGroups(trT, 'tr');
const en = buildHubLeagueGroups(enT, 'en');
const names = (groups: typeof tr) => groups.flatMap((g) => g.leagues.map((l) => l.name));

describe('Ligler sekmesi grupları', () => {
  it('planımızdaki 34 ligin her biri tam bir kez', () => {
    expect([...HUB_LEAGUE_IDS].sort((a, b) => a - b)).toEqual([...PLAN_SPORTMONKS_LEAGUE_IDS].sort((a, b) => a - b));
    expect(new Set(HUB_LEAGUE_IDS).size).toBe(34);
    expect(tr.flatMap((g) => g.leagues).length).toBe(34);
  });

  it('grup sırası ve başlıklar (TR / EN)', () => {
    expect(tr.map((g) => g.key)).toEqual(['turkey', 'europeCups', 'bigFive', 'otherEurope', 'americas', 'other']);
    expect(HUB_LEAGUE_GROUP_ORDER).toEqual(tr.map((g) => g.key));
    expect(tr.map((g) => g.title)).toEqual(['Türkiye', 'Avrupa Kupaları', '5 Büyük Lig', 'Diğer Avrupa', 'Amerika', 'Diğer']);
    expect(en.map((g) => g.title)).toEqual(['Turkey', 'European Cups', 'Big Five', 'Other Europe', 'Americas', 'Other']);
  });

  it('sabit gruplarda lig sırası', () => {
    const ids = (key: string) => tr.find((g) => g.key === key)!.leagues.map((l) => l.id);
    expect(ids('turkey')).toEqual([600, 603, 1282, 1283, 606]); // Süper Lig, 1. Lig, 2. Lig'ler, Türkiye Kupası
    expect(ids('europeCups')).toEqual([2, 5, 2286, 1328]);
    expect(ids('bigFive')).toEqual([8, 82, 564, 384, 301]);
    expect(ids('americas')).toEqual([648, 636, 779]); // Brezilya, Arjantin, MLS
    expect(ids('other')).toEqual([944]);
    expect(names(tr.slice(0, 1))).toEqual(['Süper Lig', '1. Lig', '2. Lig Beyaz', '2. Lig Kırmızı', 'Türkiye Kupası']);
  });

  it('Diğer Avrupa ülke adına göre alfabetik (dilin kendi sıralamasıyla), aynı ülkede lig → kupa', () => {
    const countries = (groups: typeof tr) => groups.find((g) => g.key === 'otherEurope')!.leagues.map((l) => l.country);
    expect(countries(tr)).toEqual([
      'Almanya', 'Belçika', 'Çekya', 'Danimarka', 'Fransa', 'Hollanda', 'İngiltere', 'İskoçya',
      'İspanya', 'İspanya', 'İsveç', 'İsviçre', 'İtalya', 'Portekiz', 'Ukrayna', 'Yunanistan',
    ]);
    expect(countries(en).slice(0, 4)).toEqual(['Belgium', 'Czechia', 'Denmark', 'England']);
    const spain = tr.find((g) => g.key === 'otherEurope')!.leagues.filter((l) => l.country === 'İspanya').map((l) => l.id);
    expect(spain).toEqual([567, 570]);
  });

  it('ülke adı lig adında geçiyorsa tekrar yazılmaz; Türkiye ve Avrupa kupalarında hiç yazılmaz', () => {
    const row = (id: number) => tr.flatMap((g) => g.leagues).find((l) => l.id === id)!;
    expect(row(636)).toMatchObject({ name: 'Arjantin Liga Profesional', showCountry: false });
    expect(row(9)).toMatchObject({ name: 'Championship', country: 'İngiltere', showCountry: true });
    expect(row(600).showCountry).toBe(false);
    expect(row(2).showCountry).toBe(false);
  });
});

describe('Ligler sekmesi araması (Türkçe karakter duyarsız)', () => {
  const ids = (groups: typeof tr) => groups.flatMap((g) => g.leagues.map((l) => l.id));

  it('"arjantin" / "ARJANTİN" / "argentina" → Arjantin', () => {
    expect(ids(filterHubLeagueGroups(tr, 'arjantin'))).toEqual([636]);
    expect(ids(filterHubLeagueGroups(tr, 'ARJANTİN'))).toEqual([636]);
    expect(ids(filterHubLeagueGroups(en, 'arjantin'))).toEqual([636]); // EN arayüzde Türkçe ülke adı da bulur
    expect(ids(filterHubLeagueGroups(tr, 'argentina'))).toEqual([636]);
  });

  it('"brezilya" → Brezilya Serie A (İtalya Serie A değil)', () => {
    expect(ids(filterHubLeagueGroups(tr, 'brezilya'))).toEqual([648]);
    expect(ids(filterHubLeagueGroups(tr, 'serie a')).sort((a, b) => a - b)).toEqual([384, 648]);
  });

  it('"turkiye" / "Türkiye" → Türkiye grubunun tamamı, yalnız o grup', () => {
    const r = filterHubLeagueGroups(tr, 'turkiye');
    expect(r.map((g) => g.key)).toEqual(['turkey']);
    expect(ids(r)).toEqual([600, 603, 1282, 1283, 606]);
    expect(ids(filterHubLeagueGroups(tr, 'Türkiye'))).toEqual(ids(r));
  });

  it('ülke adıyla: "ispanya" → La Liga, La Liga 2, İspanya Kupası; "iskocya" → İskoçya Premiership', () => {
    expect(ids(filterHubLeagueGroups(tr, 'ispanya'))).toEqual([564, 567, 570]);
    expect(ids(filterHubLeagueGroups(tr, 'iskocya'))).toEqual([501]);
  });

  it('boş sorgu her şeyi, eşleşmeyen sorgu hiçbir grubu döndürmez', () => {
    expect(filterHubLeagueGroups(tr, '   ')).toBe(tr);
    expect(filterHubLeagueGroups(tr, 'xyzq')).toEqual([]);
  });
});

describe('Ligler sekmesi logoları (deterministik CDN yolu = API image_path)', () => {
  it('34 ligin hepsi: GET /leagues?select=id,image_path (2026-10-02) ile birebir', async () => {
    const { sportmonksLeagueLogoUrl } = await import('@/utils/leagueLogo');
    // prettier-ignore
    const IMAGE_PATHS: Record<number, string> = {
      2: '2.png', 5: '5/5.png', 8: '8/8.png', 9: '9/9.png', 72: '72.png', 82: '18/82.png', 85: '21/85.png', 208: '16/208.png',
      262: '6/262.png', 271: '271.png', 301: '13/301.png', 304: '16/304.png', 325: '5/325.png', 384: '0/384.png', 387: '3/387.png',
      462: '14/462.png', 501: '501.png', 564: '20/564.png', 567: '23/567.png', 570: '26/570.png', 573: '29/573.png', 591: '15/591.png',
      600: '24/600.png', 603: '27/603.png', 606: '30/606.png', 609: '1/609.png', 636: '28/636.png', 648: '8/648.png', 779: '11/779.png',
      944: '16/944.png', 1282: '2/1282.png', 1283: '3/1283.png', 1328: '16/1328.png', 2286: '14/2286.png',
    };
    for (const id of HUB_LEAGUE_IDS) {
      expect(sportmonksLeagueLogoUrl(id)).toBe(`https://cdn.sportmonks.com/images/soccer/leagues/${IMAGE_PATHS[id]}`);
    }
  });
});
