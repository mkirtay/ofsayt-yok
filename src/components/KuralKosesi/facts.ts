/**
 * Kural Köşesi içeriği — kaynak `src/content/kural-kosesi.json` (ilk sürüm: docs/animasyon-referans/kural-kosesi.json).
 * Yeni bilgi = JSON'a tek kayıt: `animasyon` aşağıdaki anahtarlardan biri, `en` İngilizcesi; `sahneEtiketi`
 * isteğe bağlı (yalnız halka sahnesinde, sol üst etiket). Sayaç, noktalar ve günün bilgisi kendiliğinden güncellenir.
 *
 * JSON yalnız gerektiğinde dinamik import edilir (baloncuk gösterilirken / panel açılırken); ilk yüke girmez.
 */
export const FACT_ANIMATIONS = [
  '01-mac-oynaniyor',
  '02-dizilis',
  '03-var-ofsayt-yok',
  '06-gol-ani',
  '08-mac-baslamadi',
] as const;
export type FactAnimation = (typeof FACT_ANIMATIONS)[number];

type FactText = {
  baslik: string;
  metin: string;
  biliyorMuydun: string | null;
  sahneEtiketi?: string;
};

export type KuralFact = FactText & {
  id: string;
  animasyon: FactAnimation;
  en: FactText;
};

/** Ekrana basılan, dile göre seçilmiş hali. */
export type LocalizedFact = {
  id: string;
  title: string;
  body: string;
  note: string | null;
  sceneLabel: string | null;
  animation: FactAnimation;
};

export function localizeFact(fact: KuralFact, locale: string): LocalizedFact {
  const text: FactText = locale === 'en' ? fact.en : fact;
  return {
    id: fact.id,
    title: text.baslik,
    body: text.metin,
    note: text.biliyorMuydun || null,
    sceneLabel: text.sahneEtiketi || null,
    animation: fact.animasyon,
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
