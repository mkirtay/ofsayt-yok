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
