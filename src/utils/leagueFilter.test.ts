import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAGUE_FILTER,
  LEAGUE_FILTER_STORAGE_KEY,
  activeCompetitionIds,
  buildLeagueCatalog,
  filterMatchesByLeagues,
  normalizeSearch,
  parseLeagueFilter,
  presetCompetitionIds,
  readLeagueFilter,
  searchLeagues,
  writeLeagueFilter,
  type LeagueFilterState,
} from './leagueFilter';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

const ORIGINAL = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL;
});

// Sportmonks açık: maçlar Sportmonks league_id taşır (Süper Lig 600, PL 8, EL 5, 2. Lig 999…)
const m = (id: number, name = 'X') => ({ id: id * 10, competition: { id, name } });
const DAY = [m(600), m(603), m(8), m(564), m(5), m(999, '2. Lig: Beyaz')];

describe('localStorage okuma/yazma', () => {
  it('kayıt yokken filtre yok', () => {
    expect(readLeagueFilter(fakeStorage())).toEqual(DEFAULT_LEAGUE_FILTER);
  });

  it('yazılan seçim yenilemeden sonra (yeni okuma) aynen geri gelir', () => {
    const s = fakeStorage();
    const state: LeagueFilterState = { mode: 'custom', custom: [{ id: 600, name: 'Süper Lig' }, { id: 8, name: 'Premier League' }] };
    writeLeagueFilter(state, s);
    expect(s.data[LEAGUE_FILTER_STORAGE_KEY]).toBeDefined();
    expect(readLeagueFilter(s)).toEqual(state);
  });

  it('preset modu da kalıcı', () => {
    const s = fakeStorage();
    writeLeagueFilter({ mode: 'big5', custom: [] }, s);
    expect(readLeagueFilter(s).mode).toBe('big5');
  });

  it('"Tümü"ye dönüş (özel liste yoksa) anahtarı tamamen temizler', () => {
    const s = fakeStorage();
    writeLeagueFilter({ mode: 'super', custom: [] }, s);
    writeLeagueFilter(DEFAULT_LEAGUE_FILTER, s);
    expect(LEAGUE_FILTER_STORAGE_KEY in s.data).toBe(false);
  });

  it('"Tümü" modu ama kayıtlı Liglerim varsa liste korunur (chip kaybolmaz), filtre uygulanmaz', () => {
    const s = fakeStorage();
    const state: LeagueFilterState = { mode: 'all', custom: [{ id: 8, name: 'PL' }] };
    writeLeagueFilter(state, s);
    expect(readLeagueFilter(s)).toEqual(state);
    expect(activeCompetitionIds(state)).toBeNull();
  });

  it('bozuk / manipüle edilmiş değerler güvenle varsayılana düşer', () => {
    for (const raw of ['{', 'null', '"x"', '{"mode":"hack"}', '{"mode":"custom","custom":[]}', '{"mode":"custom","custom":[{"id":"7"}]}']) {
      expect(parseLeagueFilter(raw).mode).toBe('all');
    }
  });

  it('storage yok / hata fırlatırsa çökmez', () => {
    expect(readLeagueFilter(null)).toEqual(DEFAULT_LEAGUE_FILTER);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLeagueFilter(throwing)).toEqual(DEFAULT_LEAGUE_FILTER);
    expect(() => writeLeagueFilter({ mode: 'super', custom: [] }, throwing)).not.toThrow();
  });
});

describe('filtre uygulanınca liste daralır (Sportmonks id uzayı)', () => {
  it('Tümü: hiçbir şey elenmez', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(filterMatchesByLeagues(DAY, DEFAULT_LEAGUE_FILTER)).toHaveLength(DAY.length);
  });

  it('Süper Lig: yalnızca Süper Lig (1. Lig/diğerleri elenir)', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(presetCompetitionIds('super')).toEqual(new Set([600]));
    expect(filterMatchesByLeagues(DAY, { mode: 'super', custom: [] }).map((x) => x.competition.id)).toEqual([600]);
  });

  it('5 Büyük Lig: PL + La Liga (Süper Lig, Avrupa Ligi, 2. Lig elenir)', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(filterMatchesByLeagues(DAY, { mode: 'big5', custom: [] }).map((x) => x.competition.id).sort((a, b) => a - b)).toEqual([8, 564]);
  });

  it('Liglerim: yalnızca seçilenler', () => {
    const out = filterMatchesByLeagues(DAY, { mode: 'custom', custom: [{ id: 999, name: '2. Lig: Beyaz' }, { id: 5, name: 'EL' }] });
    expect(out.map((x) => x.competition.id).sort((a, b) => a - b)).toEqual([5, 999]);
  });

  it('Sportmonks kapalıyken preset\'ler legacy id ile çalışır (6 = Süper Lig)', () => {
    delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    expect(presetCompetitionIds('super')).toEqual(new Set([6]));
    expect(presetCompetitionIds('big5')).toEqual(new Set([2, 1, 3, 4, 5]));
  });

  it('hiç maç kalmazsa boş dizi döner (UI EmptyState gösterir)', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    expect(filterMatchesByLeagues([m(999)], { mode: 'super', custom: [] })).toEqual([]);
  });
});

describe('lig kataloğu + arama', () => {
  it('bilinen ligler önce, günün maçlarındaki diğer ligler alfabetik; seçili ama bugün maçsız lig de listede', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    const cat = buildLeagueCatalog(
      [{ competition: { id: 999, name: '2. Lig: Beyaz' }, country: { name: 'Turkey' } }, { competition: { id: 111, name: 'Allsvenskan' } }],
      [{ id: 222, name: 'Eredivisie' }],
    );
    expect(cat[0].name).toBe('Trendyol Süper Lig');
    const rest = cat.filter((l) => !l.known).map((l) => l.name);
    expect(rest).toEqual(['2. Lig: Beyaz', 'Allsvenskan', 'Eredivisie']);
    expect(cat.find((l) => l.id === 999)?.country).toBe('Turkey');
  });

  it('bilinen lig maçlarda farklı adla gelse de tek satır (id ile tekilleşir)', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    const cat = buildLeagueCatalog([{ competition: { id: 600, name: 'Super Lig' } }]);
    expect(cat.filter((l) => l.id === 600)).toHaveLength(1);
  });

  it('logo kaynağı grup başlıklarıyla aynı: maçtaki competition.logo (image_path) öncelikli, yoksa bilinen liglerde CDN/UEFA yedeği', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    const cat = buildLeagueCatalog([
      { competition: { id: 999, name: '2. Lig: Beyaz', logo: 'https://cdn.sportmonks.com/images/soccer/leagues/7/1282.png' } },
      { competition: { id: 111, name: 'Allsvenskan', logo: 'null' } }, // bozuk değer → yedek/undefined
    ]);
    expect(cat.find((l) => l.id === 999)?.logo).toBe('https://cdn.sportmonks.com/images/soccer/leagues/7/1282.png');
    expect(cat.find((l) => l.id === 600)?.logo).toContain('/600.png'); // bilinen lig
    expect(cat.find((l) => l.id === 2)?.logo).toBe('/images/uefa-logo.svg'); // UEFA yerel svg
    // bozuk image_path kırık görsel üretmez; CDN türetmesine düşer
    expect(cat.find((l) => l.id === 111)?.logo).toBe('https://cdn.sportmonks.com/images/soccer/leagues/15/111.png');
  });

  it('arama Türkçe/aksan duyarsız', () => {
    expect(normalizeSearch('İSVİÇRE Şampiyonlar')).toBe('isvicre sampiyonlar');
    const list = [
      { id: 1, name: 'Şampiyonlar Ligi', known: true },
      { id: 2, name: 'Serie A', country: 'İtalya', known: true },
    ];
    expect(searchLeagues(list, 'sampiyon').map((l) => l.id)).toEqual([1]);
    expect(searchLeagues(list, 'italya').map((l) => l.id)).toEqual([2]);
    expect(searchLeagues(list, '')).toHaveLength(2);
  });
});
