import { describe, it, expect } from 'vitest';
import { validatePassword, usernameRules } from './validation';

describe('validatePassword', () => {
  it('geçerli şifreyi kabul eder', () => {
    const { valid } = validatePassword('Abc123!xyz@');
    expect(valid).toBe(true);
  });

  it('kısa şifreyi reddeder', () => {
    const { valid, results } = validatePassword('Ab1!');
    expect(valid).toBe(false);
    expect(results.find((r) => r.key === 'minLength')?.passed).toBe(false);
  });

  it('büyük harf eksikse reddeder', () => {
    const { results } = validatePassword('abc123!xyz@');
    expect(results.find((r) => r.key === 'uppercase')?.passed).toBe(false);
  });

  it('küçük harf eksikse reddeder', () => {
    const { results } = validatePassword('ABC123!XYZ@');
    expect(results.find((r) => r.key === 'lowercase')?.passed).toBe(false);
  });

  it('rakam eksikse reddeder', () => {
    const { results } = validatePassword('Abcdefgh!@');
    expect(results.find((r) => r.key === 'digit')?.passed).toBe(false);
  });

  it('özel karakter eksikse reddeder', () => {
    const { results } = validatePassword('Abcdefgh12');
    expect(results.find((r) => r.key === 'special')?.passed).toBe(false);
  });

  it('boş string tüm kuralları başarısız yapar', () => {
    const { valid, results } = validatePassword('');
    expect(valid).toBe(false);
    expect(results.every((r) => !r.passed)).toBe(true);
  });
});

describe('usernameRules', () => {
  it('geçerli kullanıcı adını kabul eder', () => {
    expect(usernameRules.pattern.test('muco_1907')).toBe(true);
    expect(usernameRules.pattern.test('abc')).toBe(true);
    expect(usernameRules.pattern.test('User123')).toBe(true);
  });

  it('2 karakteri reddeder (min 3)', () => {
    expect(usernameRules.pattern.test('ab')).toBe(false);
  });

  it('31 karakteri reddeder (max 30)', () => {
    expect(usernameRules.pattern.test('a'.repeat(31))).toBe(false);
  });

  it('özel karakterleri reddeder', () => {
    expect(usernameRules.pattern.test('user@name')).toBe(false);
    expect(usernameRules.pattern.test('user-name')).toBe(false);
    expect(usernameRules.pattern.test('user name')).toBe(false);
  });
});
