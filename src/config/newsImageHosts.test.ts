import { describe, expect, it } from 'vitest';
import { isOptimizableNewsImage, NEWS_IMAGE_HOSTS } from './newsImageHosts';

describe('isOptimizableNewsImage', () => {
  it('izinli host (https) → true', () => {
    for (const host of NEWS_IMAGE_HOSTS) {
      expect(isOptimizableNewsImage(`https://${host}/a/b.jpg`)).toBe(true);
    }
  });

  it('http, bilinmeyen host, alt alan adı ve bozuk adres → false', () => {
    expect(isOptimizableNewsImage('http://image.hurimg.com/a.jpg')).toBe(false);
    expect(isOptimizableNewsImage('https://evil.example.com/a.jpg')).toBe(false);
    expect(isOptimizableNewsImage('https://x.image.hurimg.com/a.jpg')).toBe(false);
    expect(isOptimizableNewsImage('https://image.hurimg.com.evil.com/a.jpg')).toBe(false);
    expect(isOptimizableNewsImage('/images/logo.svg')).toBe(false);
    expect(isOptimizableNewsImage('')).toBe(false);
  });
});
