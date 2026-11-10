import { describe, expect, it } from 'vitest';
import { formatPlayerName } from './index';

describe('formatPlayerName', () => {
  it('tam ad → "A. Soyad"', () => expect(formatPlayerName('Aral Simsir')).toBe('A. Simsir'));
  it('zaten kısaltılmış ad aynen', () => expect(formatPlayerName('A. Güler')).toBe('A. Güler'));
  it('tek sözcük aynen', () => expect(formatPlayerName('Kenan')).toBe('Kenan'));
  it('çok sözcüklü soyad korunur', () => expect(formatPlayerName('Ismail Yuksek Demir')).toBe('I. Yuksek Demir'));
});
