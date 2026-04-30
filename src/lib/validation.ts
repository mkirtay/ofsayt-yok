/**
 * Paylaşımlı doğrulama kuralları.
 * Hem client (signup formu) hem server (register API) tarafında kullanılır.
 * Yeni kural eklemek için `passwordRules` dizisine bir satır eklemen yeterli.
 */

export type ValidationRule = {
  /** Makine tarafından kullanılan sabit anahtar */
  key: string;
  /** Kullanıcıya gösterilecek açıklama */
  label: string;
  /** Kural sağlandıysa `true` döner */
  test: (value: string) => boolean;
};

export const passwordRules: readonly ValidationRule[] = [
  {
    key: 'minLength',
    label: 'En az 10 karakter',
    test: (v) => v.length >= 10,
  },
  {
    key: 'lowercase',
    label: 'En az 1 küçük harf (a-z)',
    test: (v) => /[a-z]/.test(v),
  },
  {
    key: 'uppercase',
    label: 'En az 1 büyük harf (A-Z)',
    test: (v) => /[A-Z]/.test(v),
  },
  {
    key: 'digit',
    label: 'En az 1 rakam (0-9)',
    test: (v) => /\d/.test(v),
  },
  {
    key: 'special',
    label: 'En az 1 özel karakter (!@#$%…)',
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
] as const;

export type RuleResult = { key: string; label: string; passed: boolean };

/** Verilen değeri tüm kurallara karşı test eder. */
export function validatePassword(value: string): {
  valid: boolean;
  results: RuleResult[];
} {
  const results: RuleResult[] = passwordRules.map((r) => ({
    key: r.key,
    label: r.label,
    passed: r.test(value),
  }));

  return { valid: results.every((r) => r.passed), results };
}

export const usernameRules = {
  pattern: /^[a-zA-Z0-9_]{3,30}$/,
  message: 'Kullanıcı adı 3–30 karakter; yalnızca harf, rakam ve alt çizgi.',
} as const;
