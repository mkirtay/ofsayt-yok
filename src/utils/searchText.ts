/** Arama karşılaştırması için: küçük harf + Türkçe/aksanlı karakterleri sadeleştir. */
export function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
