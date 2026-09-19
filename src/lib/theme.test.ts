import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, normalizeTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, toggleTheme } from './theme';

describe('theme', () => {
  it('varsayılan tema dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(normalizeTheme(null)).toBe('dark');
    expect(normalizeTheme('garbage')).toBe('dark');
  });
  it('geçerli değerleri korur', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
  });
  it('toggle iki yönde çalışır', () => {
    expect(toggleTheme('dark')).toBe('light');
    expect(toggleTheme('light')).toBe('dark');
  });
  it('init script doğru storage anahtarını kullanır', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });
});
