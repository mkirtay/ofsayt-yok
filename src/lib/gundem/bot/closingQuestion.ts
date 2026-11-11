/**
 * Bot paylaşımlarının son satırı: okuru yoruma çağıran kısa soru. SAF ve deterministik (aynı maç → aynı soru; taslak yeniden
 * üretilse de metin değişmez). Sorular istatistik / taraftar dilinde; bahis çağrıştıran kalıp yok (gamblingTerms testi).
 * Soru eklenince metin `POST_MAX_LENGTH`'i aşıyorsa çağıran soruyu düşürür (içerik sorudan önce gelir).
 */
export type QuestionKind = 'PREVIEW' | 'RECAP' | 'GOAL';

export const CLOSING_QUESTIONS: Record<QuestionKind, readonly string[]> = {
  PREVIEW: ['Sence skor ne olur? Tahminini yaz 👇', 'Sence bu maçı kim kazanır?', 'İlk golü kim atar, ne dersin?', 'Bu maçta seni en çok kim heyecanlandırıyor?'],
  RECAP: ['Maçın adamı sence kimdi?', 'Bu sonucu bekliyor muydun?', 'Maçı tek kelimeyle anlat 👇', 'Bu maçtan sonra ne değişir sence?'],
  GOAL: ['Bu golden sonra skor ne olur sence?', 'Golü nasıl buldun?', 'Maçın gidişatı değişir mi sence?'],
};

/** `seed` (ör. fikstür / olay kimliği) ile listeden bir soru. */
export function closingQuestion(kind: QuestionKind, seed: number): string {
  const list = CLOSING_QUESTIONS[kind];
  const i = Math.abs(Math.trunc(seed)) % list.length;
  return list[i]!;
}

/** Gövdeye boş satırla soruyu ekler; sınırı aşarsa gövdeyi olduğu gibi döndürür. */
export function withQuestion(body: string, question: string, max: number): string {
  const out = `${body}\n\n${question}`;
  return out.length <= max ? out : body;
}
