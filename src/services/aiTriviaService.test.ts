import { describe, expect, it } from 'vitest';
import { TRIVIA_OPENAI_MODEL, validateTriviaSchema } from './aiTriviaService';

describe('trivia servisi', () => {
  it('model kodda gpt-6-luna (OPENAI_MODEL etkilemez)', () => {
    expect(TRIVIA_OPENAI_MODEL).toBe('gpt-6-luna');
  });

  it('veri yoksa contextual / rivalryContext boş olabilir; boş maddeler atılır, en fazla 5', () => {
    const out = validateTriviaSchema({ ertemFacts: ['a', ' ', 'b', 'c', 'd', 'e', 'f'], contextual: '', rivalryContext: '  ' });
    expect(out).toEqual({ ertemFacts: ['a', 'b', 'c', 'd', 'e'], contextual: '', rivalryContext: '' });
  });

  it('madde yoksa ya da alan eksikse hata', () => {
    expect(() => validateTriviaSchema({ ertemFacts: [], contextual: '', rivalryContext: '' })).toThrow();
    expect(() => validateTriviaSchema({ ertemFacts: ['a'], contextual: '' })).toThrow();
  });
});
