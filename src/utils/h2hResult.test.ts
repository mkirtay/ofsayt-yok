import { describe, expect, it } from 'vitest';
import { h2hWinner } from './h2hResult';

describe('h2hWinner', () => {
  it('skordan kazanan; beraberlik', () => {
    expect(h2hWinner('2-1')).toBe('home');
    expect(h2hWinner('0 - 3')).toBe('away');
    expect(h2hWinner('1-1')).toBe('draw');
  });

  it('penaltıya giden beraberlikte penaltı skoru', () => {
    expect(h2hWinner('1-1', '3-4')).toBe('away');
    expect(h2hWinner('2 - 2', '5 - 4')).toBe('home');
  });

  it('skor yoksa null', () => {
    expect(h2hWinner(undefined)).toBeNull();
    expect(h2hWinner('? - ?')).toBeNull();
  });
});
