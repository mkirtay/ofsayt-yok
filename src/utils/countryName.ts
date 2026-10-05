/**
 * Ülke adı görünen dilde: TR'de ISO koduna göre `Intl.DisplayNames` ("TR" → "Türkiye"); EN'de (ve kod yoksa)
 * Sportmonks'un İngilizce adı. Sunucu ve tarayıcı aynı ICU verisini kullanır (hydration eşleşir).
 */
const trRegions = (() => {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' });
  } catch {
    return null;
  }
})();

/**
 * Sportmonks'un ISO kodu yanıltıcı olan bölgeler (ada göre): İskoçya / Galler / K. İrlanda `GB` ("Birleşik Krallık"),
 * İngiltere `EN` (tanımsız), Avrupa `EU` ("Avrupa Birliği").
 */
const TR_NAME_OVERRIDES: Record<string, string> = {
  England: 'İngiltere',
  Scotland: 'İskoçya',
  Wales: 'Galler',
  'Northern Ireland': 'Kuzey İrlanda',
  Europe: 'Avrupa',
  World: 'Dünya',
};

export function countryDisplayName(country: { name: string; iso2?: string | null }, locale: string): string {
  if (locale !== 'en' && TR_NAME_OVERRIDES[country.name]) return TR_NAME_OVERRIDES[country.name]!;
  if (locale !== 'en' && country.iso2 && /^[A-Z]{2}$/.test(country.iso2)) {
    try {
      const tr = trRegions?.of(country.iso2);
      if (tr && tr !== country.iso2) return tr;
    } catch {
      // geçersiz kod → API adı
    }
  }
  return country.name;
}
