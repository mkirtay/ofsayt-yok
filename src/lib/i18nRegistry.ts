/**
 * Çeviri sözlüklerinin kayıt defteri (`lib/i18n.tsx` buradan okur).
 *
 * Her sayfaya iki dilin bütün namespace'lerini gömmek yerine:
 * - TR temel namespace'ler (her sayfada: header, alt menü, maç listesi) `lib/i18n.tsx`'te statik,
 * - TR sayfaya özel namespace'ler, onları KULLANAN modülden yan etkiyle kaydedilir
 *   (`import '@/lib/i18nNamespaces/<ns>'`) → yalnız o sayfanın chunk'ına girer; SSR'da da hazırdır,
 * - EN tek parça olarak dil seçilince yüklenir (`lib/i18nEnglish.ts`).
 *
 * Ayrı modül çünkü testler `@/lib/i18n`'i tamamen taklit ediyor; yan etki kayıtları bunu import etmemeli.
 */
export type TranslationDict = Record<string, unknown>;
export type RegistryLocale = 'tr' | 'en';

const registry: Record<RegistryLocale, Record<string, TranslationDict>> = { tr: {}, en: {} };

export function registerNamespace(locale: RegistryLocale, ns: string, dict: unknown): void {
  if (!registry[locale][ns]) registry[locale][ns] = dict as TranslationDict;
}

export function getNamespace(locale: string, ns: string): TranslationDict | undefined {
  return (registry as Record<string, Record<string, TranslationDict>>)[locale]?.[ns];
}

export function hasNamespace(locale: RegistryLocale, ns: string): boolean {
  return Boolean(registry[locale][ns]);
}
