/**
 * Çoğul biçim seçimi (i18next `_one`/`_other` son eki kuralı, sadeleştirilmiş).
 *
 * `t(key, { count })` çağrısında sırayla denenir: `${key}_${kategori}` (Intl.PluralRules; en: one/other) → `${key}`.
 * Türkçede sayıdan sonra isim çoğul çekimlenmez ("1 maç", "3 maç") → tr sözlükleri yalnızca taban anahtarı tutar.
 * İngilizcede taban anahtar çoğul biçimdir, tekil hâl `_one` ile verilir ("1 match" / "3 matches").
 */

const RULES = new Map<string, Intl.PluralRules>();

function pluralCategory(locale: string, count: number): string {
  let rules = RULES.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    RULES.set(locale, rules);
  }
  return rules.select(count);
}

/** `count` sayı ise ve sözlükte o kategorinin anahtarı varsa onu, yoksa taban anahtarı döndürür. */
export function resolvePluralKey(
  key: string,
  count: unknown,
  locale: string,
  has: (candidate: string) => boolean,
): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return key;
  const candidate = `${key}_${pluralCategory(locale, count)}`;
  return has(candidate) ? candidate : key;
}
