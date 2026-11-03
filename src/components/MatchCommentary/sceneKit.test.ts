import { describe, expect, it } from 'vitest';
import { colorDistance, MIN_DISTINCT } from '@/services/sportmonks/momentumColors';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';
import { sceneKits, shortName, surname } from './sceneKit';

const squads = (home: string | null, away: string | null) =>
  ({ home: { name: 'A', formation: null, players: [], color: home }, away: { name: 'B', formation: null, players: [], color: away } }) as SceneSquads;

describe('sceneKits', () => {
  it('maça özel forma rengi; numara rengi zemine göre (koyu formaya beyaz, açık formaya siyah)', () => {
    const k = sceneKits(squads('#c40010', '#f4f48a'));
    expect(k.home.outfield).toMatchObject({ fill: '#c40010', text: '#ffffff' });
    expect(k.away.outfield).toMatchObject({ fill: '#f4f48a', text: '#111111' });
  });

  it('renk yoksa ev açık, deplasman koyu yedek', () => {
    const k = sceneKits(null);
    expect(k.home.outfield.fill).toBe('#ffffff');
    expect(k.away.outfield.fill).toBe('#1d3a8a');
  });

  it('iki renk çok yakınsa deplasman alternatif renge geçer', () => {
    const k = sceneKits(squads('#c40010', '#c80514'));
    expect(colorDistance(k.home.outfield.fill, k.away.outfield.fill)).toBeGreaterThanOrEqual(MIN_DISTINCT);
  });

  it('kaleciler iki takımdan, çimden ve birbirinden ayrışır', () => {
    const k = sceneKits(squads('#04614a', '#f5d90a'));
    const keepers = [k.home.keeper.fill, k.away.keeper.fill];
    expect(keepers[0]).not.toBe(keepers[1]);
    for (const g of keepers) for (const c of ['#04614a', '#f5d90a', '#00a76f']) expect(colorDistance(g, c)).toBeGreaterThanOrEqual(MIN_DISTINCT);
  });
});

describe('ad kısaltma', () => {
  it('başlık "M. Salah", etiket soyad; bağlaçlı soyad korunur, tek ad olduğu gibi', () => {
    expect(shortName('Mohamed Salah')).toBe('M. Salah');
    expect(shortName('Evanilson')).toBe('Evanilson');
    expect(surname('Mohamed Salah')).toBe('Salah');
    expect(surname('Virgil van Dijk')).toBe('van Dijk');
  });
});
