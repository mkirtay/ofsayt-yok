import { describe, it, expect } from 'vitest';
import { buildMatchSlug, buildMatchHref, parseMatchIdFromParam } from './matchUrl';

describe('buildMatchSlug', () => {
  it('Türkçe karakterleri ASCII\'ye çevirir', () => {
    expect(buildMatchSlug({ home: { name: 'Başakşehir' }, away: { name: 'Trabzonspor' } }))
      .toBe('basaksehir-trabzonspor');
  });

  it('büyük harfleri küçük yapar', () => {
    expect(buildMatchSlug({ home: { name: 'GALATASARAY' }, away: { name: 'Fenerbahçe' } }))
      .toBe('galatasaray-fenerbahce');
  });

  it('özel karakterleri tire ile değiştirir', () => {
    expect(buildMatchSlug({ home: { name: 'Borussia Dortmund' }, away: { name: 'Real Madrid' } }))
      .toBe('borussia-dortmund-real-madrid');
  });

  it('home_name / away_name fallback kullanır', () => {
    expect(buildMatchSlug({ home_name: 'Arsenal', away_name: 'Chelsea' }))
      .toBe('arsenal-chelsea');
  });

  it('her iki taraf da eksikse boş döner', () => {
    expect(buildMatchSlug({})).toBe('');
  });
});

describe('buildMatchHref', () => {
  it('slug ile tam URL üretir', () => {
    const href = buildMatchHref({ id: 123, home: { name: 'Arsenal' }, away: { name: 'Chelsea' } });
    expect(href).toBe('/matches/123-arsenal-chelsea');
  });

  it('slug yoksa sadece id döner', () => {
    expect(buildMatchHref({ id: 456 })).toBe('/matches/456');
  });
});

describe('parseMatchIdFromParam', () => {
  it('id-slug formatından id çıkarır', () => {
    expect(parseMatchIdFromParam('123-trabzonspor-galatasaray')).toBe('123');
  });

  it('sadece id varsa onu döner', () => {
    expect(parseMatchIdFromParam('789')).toBe('789');
  });

  it('sayısal olmayan prefix varsa tümünü döner', () => {
    expect(parseMatchIdFromParam('abc-def')).toBe('abc-def');
  });
});

describe('slugify — Türkçe harfler + aksanlar (2026-10-04)', async () => {
  const { slugify, legacySlugify, buildMatchSlug, matchSlugMatches } = await import('./matchUrl');
  it('istenen örnekler', () => {
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify('Unión Santa Fe')).toBe('union-santa-fe');
    expect(slugify('Gençlerbirliği')).toBe('genclerbirligi');
    expect(slugify('Beşiktaş')).toBe('besiktas');
    expect(slugify('İstanbul Başakşehir')).toBe('istanbul-basaksehir');
  });
  it('diğer aksanlar ve ayrışmayan Latin harfleri', () => {
    expect(slugify('Atlético Tucumán')).toBe('atletico-tucuman');
    expect(slugify('Vélez Sarsfield')).toBe('velez-sarsfield');
    expect(slugify('Bodø/Glimt')).toBe('bodo-glimt');
    expect(slugify('Mönchengladbach')).toBe('monchengladbach');
    expect(slugify('ÇAYKUR RİZESPOR')).toBe('caykur-rizespor');
    expect(slugify('Kasımpaşa')).toBe('kasimpasa');
  });
  it('idempotent; eski kural yalnız eski adresleri tanımak için', () => {
    expect(slugify(slugify('São Paulo'))).toBe('sao-paulo');
    expect(legacySlugify('São Paulo')).toBe('s-o-paulo');
    expect(buildMatchSlug({ home_name: 'São Paulo', away_name: 'Santos' })).toBe('sao-paulo-santos');
  });
  it("eski id aralığında birebir karşılaştırma: yeni slug ve eski kuralın slug'ı kabul, başka maç değil", () => {
    const m = { home_name: 'São Paulo', away_name: 'Santos' };
    expect(matchSlugMatches('sao-paulo-santos', m)).toBe(true);
    expect(matchSlugMatches('s-o-paulo-santos', m)).toBe(true);
    expect(matchSlugMatches('S%C3%A3o-Paulo-Santos', m)).toBe(true);
    expect(matchSlugMatches('flamengo-santos', m)).toBe(false);
  });
});
