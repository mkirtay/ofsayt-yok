import { describe, it, expect } from 'vitest';
import { cacheEnv, cacheKeyPrefix } from './cacheNamespace';

describe('cacheNamespace', () => {
  it('VERCEL_ENV → ortam; tanımsız (yerel) → dev', () => {
    expect(cacheEnv('production')).toBe('prod');
    expect(cacheEnv('preview')).toBe('preview');
    expect(cacheEnv('development')).toBe('dev');
    expect(cacheEnv(undefined)).toBe('dev');
  });

  it('önek ortam + şema sürümü', () => {
    expect(cacheKeyPrefix('production')).toBe('prod:v2:');
    expect(cacheKeyPrefix('preview')).toBe('preview:v2:');
    expect(cacheKeyPrefix(undefined)).toBe('dev:v2:');
  });
});
