/**
 * Eski AI analizlerinde (prompt v3-2026-10 öncesi) serbest metinlerdeki bahis dili OKUMA ANINDA temizlenir —
 * veritabanına yazılmaz. Eski analizler yeniden üretilmez (çoğu bitmiş maç: isabet istatistiği bozulur, maç
 * sonrası veriyle "maç öncesi" analiz üretilmiş olur). API okuma ucu (`toPublicAnalysis`) uygular → web ve mobil
 * aynı temiz metni alır.
 *
 * Kural: `gamblingTerms` desenlerinden birini içeren CÜMLE çıkarılır. Temizlik bir alanı boşaltır ya da
 * `MIN_KEPT_LENGTH`'in altına indirirse alan tamamen gizlenir (boş metin; arayüz boş alanı çizmez). Hiç cümle
 * çıkmayan alana dokunulmaz (kısa olsa da).
 */
import { findGamblingTerms } from './gamblingTerms';

export const MIN_KEPT_LENGTH = 40;

/** Bu sürümden itibaren prompt bahis dilini yasaklıyor; o analizlere dokunulmaz. */
const FIRST_CLEAN_PROMPT_MAJOR = 3;

/** `v2-2026-07-anthropic:…` → 2. Okunamayan sürüm eski sayılır (temizlenir). */
export function isPreCleanModelVersion(modelVersion: string | null | undefined): boolean {
  const major = Number(/^v(\d+)\b/.exec(modelVersion ?? '')?.[1]);
  return !Number.isFinite(major) || major < FIRST_CLEAN_PROMPT_MAJOR;
}

/** Sonunda nokta olan ama cümle bitirmeyen kısaltmalar (küçük harfle). */
const ABBREVIATIONS = new Set([
  'vb', 'vs', 'örn', 'bkz', 'yy', 'dk', 'sn', 'sa', 'no', 'nr', 'st', 'dr', 'prof', 'doç', 'av', 'mah', 'cad', 'sok',
  'ing', 'fr', 'alm', 'yrd', 'krş', 'e.g', 'i.e', 'etc', 'vd',
]);

const UPPER_START = /^["'“‘(«]?[A-ZÇĞİÖŞÜÂÎÛ0-9]/;

/**
 * Türkçe cümle bölme. Sınır: `.`, `!`, `?`, `…` (+ kapanan tırnak/parantez) + boşluk + büyük harf / rakam / açılan
 * tırnak, ya da satır sonu. Sınır SAYILMAZ: "2.5" gibi ondalık (boşluk yok), bilinen kısaltma ("örn.", "vb."), tek
 * büyük harf baş harfi ("A. Kaya"), 1–3 haneli sıra sayısı ("3. Lig", "85. dakika").
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /([.!?…]+["'”’)»]*)(\s+)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[1].length;
    const after = text.slice(m.index + m[0].length);
    const newline = m[2].includes('\n');
    const before = text.slice(start, m.index);
    const lastToken = /(\S+)$/.exec(before)?.[1] ?? '';
    const isAbbrev = m[1] === '.' && ABBREVIATIONS.has(lastToken.toLocaleLowerCase('tr').replace(/^["'“‘(«]+/, ''));
    const isInitial = m[1] === '.' && /^[A-ZÇĞİÖŞÜ]$/.test(lastToken);
    const isOrdinal = m[1] === '.' && /^\d{1,3}$/.test(lastToken);
    const boundary = newline || (UPPER_START.test(after) && !isAbbrev && !isInitial && !isOrdinal);
    if (!boundary) continue;
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Bahis dili geçen cümleler çıkarılır; `removed`: en az bir cümle çıktı mı. */
export function stripGamblingSentences(text: string): { text: string; removed: boolean } {
  const sentences = splitSentences(text);
  const kept = sentences.filter((s) => findGamblingTerms(s).length === 0);
  if (kept.length === sentences.length) return { text, removed: false };
  return { text: kept.join(' '), removed: true };
}

/** Tek alan: temizlik alanı boşalttı ya da çok kısalttıysa '' (gizli). */
export function sanitizeText(text: string): string {
  const { text: cleaned, removed } = stripGamblingSentences(text);
  if (!removed) return text;
  return cleaned.length < MIN_KEPT_LENGTH ? '' : cleaned;
}

/** JSON değeri içindeki tüm metinler; dizilerde gizlenen (boş kalan) maddeler atılır. Sayı/boolean dokunulmaz. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') return sanitizeText(value) as T;
  if (Array.isArray(value)) {
    return value
      .map((v) => sanitizeDeep(v))
      .filter((v, i) => !(typeof value[i] === 'string' && v === '')) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeDeep(v)])) as T;
  }
  return value;
}

/** Kullanıcıya gösterilen serbest metin alanları (bettingTips ayrı: API'de hiç dönmez). */
const TEXT_FIELDS = [
  'fullReport',
  'teamAnalyses',
  'matchPrediction',
  'scorePrediction',
  'goalExpectation',
  'riskReasoning',
  'homeTeamNarrative',
  'awayTeamNarrative',
] as const;

/** Eski sürüm analizinin serbest metinleri temizlenmiş kopyası; v3+ analiz aynen döner. */
export function sanitizeLegacyAnalysis<T extends { modelVersion?: string | null }>(row: T): T {
  if (!isPreCleanModelVersion(row.modelVersion)) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const key of TEXT_FIELDS) {
    if (key in copy) copy[key] = sanitizeDeep(copy[key]);
  }
  return copy as T;
}
