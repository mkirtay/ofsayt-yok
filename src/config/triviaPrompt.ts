/**
 * Maç trivia prompt'u (v2, 2026-10): YALNIZ bağlamdaki veriye dayanır.
 *
 * v1 modelin genel futbol bilgisini ("tarihi rekabet", transfer geçmişi) kullanıyordu → doğrulanamayan, uydurma
 * riskli içerik. v2: veri = analizle aynı özet (buildMatchDataSummary: form, son maçlar, ligde sezon, gol
 * dakikaları, golcüler, eksikler, kadro, H2H). Alanlar ve DB sütunları aynı:
 *   1. ertemFacts      — veriden 3-5 ilginç istatistik
 *   2. contextual      — kadro/eksik/golcü bağlamı (veri yoksa boş)
 *   3. rivalryContext  — yalnız verilen H2H'tan karşılaşma geçmişi (H2H yoksa boş)
 * Çıktı katı JSON şemasıyla alınır (TRIVIA_RESPONSE_FORMAT).
 */
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { buildMatchDataSummary } from '@/config/analysisPrompt';

export const TRIVIA_MODEL_VERSION = 'v2-trivia-data-2026-10';

export const TRIVIA_SYSTEM_PROMPT = `Sen bir futbol istatistik editörüsün. Sana verilen maç verisinden kısa, ilginç
ve DOĞRULANABİLİR trivia üreteceksin.

KURALLAR:
1. YALNIZ verilen veriyi kullan. Genel futbol bilgin, tarihî olaylar, transfer/kariyer geçmişi, verilmeyen eski
   maçlar ve oyuncu biyografileri YASAK.
2. Yazdığın her sayı, isim ve tarih verilen veride birebir geçmeli. Veride olmayan bir şeyi yazma; bir alan için
   veri yoksa o alanı boş string ("") bırak.
3. Türkçe, akıcı ve vurucu yaz; sayıları cümle içinde kullan. Şemadaki kelime sınırları üst sınırdır. Kaynağa
   atıf yapma ("verilen", "veriye göre", "notta", "listede belirtildiği gibi" YAZMA) — olguyu doğrudan yaz.
4. Bahis dili yasak ("bahis", "iddaa", "kupon", "banko", "oran", "üst/alt", "KG var/yok", "1X2"); olasılık
   tahmini de yapma — bu bölüm tahmin değil, veri.
5. Çıktı yalnız JSON.`;

export type TriviaJsonSchema = {
  ertemFacts: string[];
  contextual: string;
  rivalryContext: string;
};

const OUTPUT_SCHEMA_DESCRIPTION = `{
  "ertemFacts": ["3-5 madde; her biri 1 cümle, en fazla 20 kelime; verideki sayılardan şaşırtıcı bir gözlem (örn. 'Galatasaray ligde attığı 13 golün 6'sını son yarım saatte buldu.')"],
  "contextual": "Kadro bağlamı: eksikler, muhtemel 11 ve golcülerden 1-2 cümle, en fazla 40 kelime; bu veri yoksa \\"\\"",
  "rivalryContext": "Karşılaşma geçmişi: YALNIZ verilen H2H satırlarından 1-2 cümle, en fazla 40 kelime; H2H yoksa \\"\\""
}`;

export function buildTriviaUserMessage(ctx: MatchAnalysisContext): string {
  return `${buildMatchDataSummary(ctx)}

---

Yukarıdaki veriyi kullanarak trivia içeriğini aşağıdaki JSON yapısında yaz. Yalnız JSON.

${OUTPUT_SCHEMA_DESCRIPTION}`;
}

/** OpenAI structured outputs (strict): bütün alanlar zorunlu; boş string izinli. */
export const TRIVIA_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'match_trivia',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        ertemFacts: { type: 'array', items: { type: 'string' } },
        contextual: { type: 'string' },
        rivalryContext: { type: 'string' },
      },
      required: ['ertemFacts', 'contextual', 'rivalryContext'],
      additionalProperties: false,
    },
  },
};
