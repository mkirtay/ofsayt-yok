import { describe, expect, it } from 'vitest';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { CLOSING_QUESTIONS, closingQuestion, withQuestion } from './closingQuestion';

describe('bot kapanış sorusu', () => {
  it('aynı maç için sabit, farklı maçlarda dağılır', () => {
    expect(closingQuestion('RECAP', 42)).toBe(closingQuestion('RECAP', 42));
    const seen = new Set([0, 1, 2, 3].map((n) => closingQuestion('PREVIEW', n)));
    expect(seen.size).toBe(CLOSING_QUESTIONS.PREVIEW.length);
  });

  it('sınırı aşarsa soru eklenmez', () => {
    expect(withQuestion('abc', 'Soru?', 20)).toBe('abc\n\nSoru?');
    expect(withQuestion('x'.repeat(18), 'Soru?', 20)).toBe('x'.repeat(18));
  });

  it('sorularda bahis dili yok', () => {
    for (const q of Object.values(CLOSING_QUESTIONS).flat()) expect(findGamblingTerms(q), q).toEqual([]);
  });
});
