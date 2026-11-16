/**
 * Kural Köşesi içeriği — kaynak `src/content/kural-kosesi.json` (ilk sürüm: docs/animasyon-referans/kural-kosesi.json).
 * Yeni bilgi = JSON'a tek kayıt: `animasyon` aşağıdaki anahtarlardan biri (docs/animasyon-referans/ dosya adı),
 * `en` İngilizcesi, `soru` kartın altındaki mini test (3 şık; `dogru` şık sırası, EN'de aynı sıra). Sayaç, noktalar ve günün bilgisi kendiliğinden güncellenir.
 *
 * JSON yalnız gerektiğinde dinamik import edilir (baloncuk gösterilirken / panel açılırken); ilk yüke girmez.
 */
export const FACT_ANIMATIONS = [
  '01-mac-oynaniyor',
  '02-dizilis',
  '03-var-ofsayt-yok',
  '11-var-penalti',
  '12-uzatma-tabelasi',
  '13-kaleci-8-saniye',
  '14-penalti-kaleci',
  '15-toplam-skor-bandi',
] as const;
export type FactAnimation = (typeof FACT_ANIMATIONS)[number];

/** Bilgi kartının altındaki tek soruluk mini test. Doğru şık dil bağımsız: `dogru` yalnız TR kayıtta. */
type QuizText = {
  soru: string;
  secenekler: string[];
  aciklama: string;
};

type FactText = {
  baslik: string;
  metin: string;
  biliyorMuydun: string | null;
};

export type KuralFact = FactText & {
  id: string;
  animasyon: FactAnimation;
  soru: QuizText & { dogru: number };
  en: FactText & { soru: QuizText };
};

export type LocalizedQuiz = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

/** Ekrana basılan, dile göre seçilmiş hali. */
export type LocalizedFact = {
  id: string;
  title: string;
  body: string;
  note: string | null;
  animation: FactAnimation;
  quiz: LocalizedQuiz;
};

export function localizeFact(fact: KuralFact, locale: string): LocalizedFact {
  const text: FactText = locale === 'en' ? fact.en : fact;
  const quiz: QuizText = locale === 'en' ? fact.en.soru : fact.soru;
  return {
    id: fact.id,
    title: text.baslik,
    body: text.metin,
    note: text.biliyorMuydun || null,
    animation: fact.animasyon,
    quiz: {
      question: quiz.soru,
      options: quiz.secenekler,
      correct: fact.soru.dogru,
      explanation: quiz.aciklama,
    },
  };
}

let factsLoad: Promise<KuralFact[]> | null = null;
/** Tek seferlik yükleme; hata olursa sonraki çağrı yeniden dener. */
export function loadFacts(): Promise<KuralFact[]> {
  factsLoad ??= import('@/content/kural-kosesi.json').then(
    (mod) => (mod.default as unknown as KuralFact[]),
    (error) => {
      factsLoad = null;
      throw error;
    },
  );
  return factsLoad;
}
