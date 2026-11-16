import { describe, expect, it } from 'vitest';
import { QUIZ_STORAGE_KEY, quizScore, readAnswers, recordAnswer, writeAnswers } from './quizState';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const FACTS = [
  { id: 'a', soru: { dogru: 0 } },
  { id: 'b', soru: { dogru: 2 } },
  { id: 'c', soru: { dogru: 1 } },
];

describe('Kural Köşesi mini testi', () => {
  it('ilk cevap kalır, ikinci seçim yok sayılır', () => {
    const first = recordAnswer({}, 'a', 1);
    expect(first).toEqual({ a: 1 });
    expect(recordAnswer(first, 'a', 0)).toBe(first);
  });

  it('skor yalnız mevcut bilgileri sayar', () => {
    expect(quizScore({ a: 0, b: 1, eski: 0 }, FACTS)).toEqual({ answered: 2, correct: 1, total: 3 });
    expect(quizScore({}, FACTS)).toEqual({ answered: 0, correct: 0, total: 3 });
  });

  it('depolamaya yazar ve geri okur; bozuk kaydı yok sayar', () => {
    const storage = memoryStorage();
    writeAnswers(storage, { a: 0, b: 2 });
    expect(readAnswers(storage)).toEqual({ a: 0, b: 2 });
    expect(readAnswers(memoryStorage({ [QUIZ_STORAGE_KEY]: '{bozuk' }))).toEqual({});
    expect(readAnswers(memoryStorage({ [QUIZ_STORAGE_KEY]: '[1,2]' }))).toEqual({});
    expect(readAnswers(memoryStorage({ [QUIZ_STORAGE_KEY]: '{"a":"x","b":1,"c":-1}' }))).toEqual({ b: 1 });
  });

  it('depolama yoksa okuma boş, yazma sessiz', () => {
    expect(readAnswers(null)).toEqual({});
    expect(() => writeAnswers(null, { a: 0 })).not.toThrow();
  });
});
