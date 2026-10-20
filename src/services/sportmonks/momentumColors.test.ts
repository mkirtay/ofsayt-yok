import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/momentumSuperLig.json';
import {
  adjustForContrast,
  colorDistance,
  contrastRatio,
  MIN_DISTINCT,
  MOMENTUM_THEME_BG,
  momentumColorsFromMetadata,
  pickMomentumColors,
} from './momentumColors';

describe('pickMomentumColors', () => {
  it('gerçek SL maçı (metadata 161/162): Gençlerbirliği kırmızı, GS deplasman beyazı; beyaz açık temada kenar çizgisi alır', () => {
    const c = momentumColorsFromMetadata(fixture.data.metadata)!;
    expect(c.home).toEqual({ fill: '#c40010', edge: { light: null, dark: null } });
    expect(c.away.fill).toBe('#f0f0f0');
    expect(c.away.edge.dark).toBeNull();
    expect(c.away.edge.light).not.toBeNull();
    expect(contrastRatio(c.away.edge.light!, MOMENTUM_THEME_BG.light)).toBeGreaterThanOrEqual(3);
  });

  it('iki takım aynı renkteyse deplasman formasındaki sıradaki farklı renge düşer', () => {
    const c = pickMomentumColors(
      { participant: '#C40010', kit: '#C40010,#FFFFFF' },
      { participant: '#B5001A', kit: '#B5001A,#B5001A,#FFD100,#0A0A0A' },
    )!;
    expect(colorDistance('#c40010', '#b5001a')).toBeLessThan(MIN_DISTINCT);
    expect(c.away.fill).toBe('#ffd100');
  });

  it('formada farklı renk yoksa token (mavi, ev de maviyse yeşil)', () => {
    expect(pickMomentumColors({ participant: '#C40010' }, { participant: '#C00010', kit: '#C00010' })!.away.fill).toBe('#0ea5e9');
    expect(pickMomentumColors({ participant: '#0EA5E9' }, { participant: '#0FA0E0' })!.away.fill).toBe('#00a76f');
  });

  it('siyah koyu temada açıklaştırılmış kenar alır, açık temada almaz', () => {
    const c = pickMomentumColors({ participant: '#0A0A0A' }, { participant: '#FFD100' })!;
    expect(c.home.edge.light).toBeNull();
    expect(c.home.edge.dark).not.toBeNull();
    expect(contrastRatio(c.home.edge.dark!, MOMENTUM_THEME_BG.dark)).toBeGreaterThanOrEqual(3);
    // Sarı açık zeminde 3:1'in altında → koyulaştırılmış kenar.
    expect(c.away.edge.light).not.toBeNull();
  });

  it('renk yoksa / bozuksa null (bileşen token renklerini kullanır)', () => {
    expect(pickMomentumColors(null, { participant: '#FFFFFF' })).toBeNull();
    expect(pickMomentumColors({ participant: 'red' }, { participant: '#FFFFFF' })).toBeNull();
    expect(pickMomentumColors({ participant: '#FFFFFF' }, { participant: null, kit: '' })).toBeNull();
    expect(momentumColorsFromMetadata([])).toBeNull();
    expect(momentumColorsFromMetadata(undefined)).toBeNull();
  });

  it('adjustForContrast koyu zeminde beyaza, açık zeminde siyaha doğru karıştırır', () => {
    const d = adjustForContrast('#202020', MOMENTUM_THEME_BG.dark);
    expect(contrastRatio(d, MOMENTUM_THEME_BG.dark)).toBeGreaterThanOrEqual(3);
    const l = adjustForContrast('#eeeeee', MOMENTUM_THEME_BG.light);
    expect(contrastRatio(l, MOMENTUM_THEME_BG.light)).toBeGreaterThanOrEqual(3);
  });
});
