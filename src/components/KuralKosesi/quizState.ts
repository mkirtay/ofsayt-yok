/**
 * Kural Köşesi mini testi — cevaplar tarayıcıda (localStorage, tek anahtar) tutulur; hesap/sunucu yok.
 * Kayıt: bilgi id'si → seçilen şık. Yalnız ilk cevap sayılır (tekrar seçim yok). Depolama yoksa cevaplar
 * yalnız panel açıkken bellekte kalır.
 */
export const QUIZ_STORAGE_KEY = 'oy_kural_kosesi_quiz';

export type QuizAnswers = Record<string, number>;

export function readAnswers(storage: Storage | null): QuizAnswers {
  if (!storage) return {};
  try {
    const raw = storage.getItem(QUIZ_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: QuizAnswers = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (Number.isInteger(value) && (value as number) >= 0) out[id] = value as number;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeAnswers(storage: Storage | null, answers: QuizAnswers): void {
  if (!storage) return;
  try {
    storage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Kota dolu vb.: cevap bu açılışta görünür, kalıcı olmaz.
  }
}

/** İlk cevap kalır: aynı soruya ikinci seçim yok sayılır. */
export function recordAnswer(answers: QuizAnswers, factId: string, choice: number): QuizAnswers {
  if (factId in answers) return answers;
  return { ...answers, [factId]: choice };
}

export type QuizScore = { answered: number; correct: number; total: number };

/** Yalnız bugünkü bilgiler sayılır: kaldırılmış bilgilerin eski cevapları skoru bozmaz. */
export function quizScore(answers: QuizAnswers, facts: { id: string; soru: { dogru: number } }[]): QuizScore {
  let answered = 0;
  let correct = 0;
  for (const f of facts) {
    if (!(f.id in answers)) continue;
    answered += 1;
    if (answers[f.id] === f.soru.dogru) correct += 1;
  }
  return { answered, correct, total: facts.length };
}
