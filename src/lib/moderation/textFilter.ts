/**
 * Gündem içerik filtresi (saf; DB yok). Sözlük: src/config/moderationTerms.json (+ yöneticinin eklediği ModerationTerm
 * satırları, lib/moderation/terms.ts). Sunucu tarafında çalışır — istemciye güvenilmez.
 *
 * Normalizasyon (terimler de aynısından geçer):
 *  - Türkçe küçük harf (I→ı, İ→i), leet (0→o 1→i 3→e 4→a 5→s 7→t 8→b 9→g @→a $→s !→i) yalnız harf içeren kelimede
 *    (skor "3-1" bozulmaz), harf tekrarları tekleşir ("amkkkk" → "amk", "taşşak" → "tasak").
 *  - Üç ayrı biçim: fold (ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u), strict (ı ayrı kalır: "sıktı" ≠ "sikti"), raw (Türkçe harfler
 *    korunur: "göt" ≠ "got"). Her terim kendi biçiminde aranır → masum kelimelerin ASCII hâli yanlışlıkla eşleşmez.
 *  - Kelime sınırı: exact = kelimenin tamamı, prefix = kelime başı (Türkçe ekler), contains = kelime içi + boşluk / nokta /
 *    yıldız atılmış tüm metin (yalnız ayırt edici uzun terimler; "s.i.k.t.i.r", "o r o s p u").
 *  - Harf arası ayırıcı: en az 3 tek harflik kelime art arda → birleştirilmiş kelime de aranır ("a m k", "a.m.k").
 *  - URL / e-posta: nokta, eğik çizgi ve @ ayırıcıdır → "www.<terim>.com", "<terim>@x.com" kelimeye bölünür.
 *  - Yıldızla sansür ("s*ktir"): yıldız tek harf joker; en fazla 1/3'ü maskelenmiş ≥5 harfli terimler → ORTA (işaret).
 */
export type TermLevel = 'block' | 'flag';
export type TermMatch = 'exact' | 'prefix' | 'contains';
export type TermVariant = 'fold' | 'strict' | 'raw';

/** Sözlük satırı (JSON biçimi). */
export type FilterTerm = { t: string; m: TermMatch; l: TermLevel; c: string; v?: TermVariant };

export type FilterVerdict = {
  /** ok = temiz, flag = ORTA (yayınlanır, kuyruğa), block = AĞIR (reddedilir) */
  level: 'ok' | TermLevel;
  /** Eşleşen kategoriler (profanity, sexual, hate, threat, insult, spam …) — kelime ASLA döndürülmez/loglanmaz. */
  categories: string[];
};

type CompiledTerm = { words: string[]; joined: string; m: TermMatch; l: TermLevel; c: string; v: TermVariant };
export type CompiledDictionary = { terms: CompiledTerm[]; allow: Set<string> };

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e',
};
const FOLD_STRICT: Record<string, string> = { ş: 's', ç: 'c', ğ: 'g', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u' };
const VARIANTS: readonly TermVariant[] = ['fold', 'strict', 'raw'];

function lowerTr(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
}

function foldChars(s: string, v: TermVariant): string {
  if (v === 'raw') return s;
  let out = '';
  for (const ch of s) {
    const f = FOLD_STRICT[ch] ?? ch;
    out += v === 'fold' && f === 'ı' ? 'i' : f;
  }
  return out;
}

const collapse = (s: string) => s.replace(/(\p{L})\1+/gu, '$1');
const hasLetter = (s: string) => /\p{L}/u.test(s);

/** Tek kelime normalizasyonu (leet yalnız harf içeren kelimede; '*' joker olarak kalır). */
function normalizeToken(raw: string, v: TermVariant): string {
  let w = raw.replace(/^[@#]+/, ''); // @etiket / #etiket işareti kelimenin parçası değil
  if (!hasLetter(w)) return '';
  let out = '';
  for (const ch of w) out += LEET[ch] ?? ch;
  w = out.replace(/[^\p{L}*]/gu, '');
  return collapse(foldChars(w, v));
}

/**
 * Kelimelere böl: harf, rakam ve leet işaretleri kelime içinde kalır. İki mod: (1) @ harf, * joker; (2) @ ve * ayırıcı
 * ("a*m*k" → a m k → birleşik "amk").
 */
function tokenize(lowered: string, v: TermVariant, symbolsAsSeparators: boolean): string[] {
  const splitter = symbolsAsSeparators ? /[^\p{L}\p{N}$!|€]+/u : /[^\p{L}\p{N}*@$!|€]+/u;
  const tokens = lowered
    .split(splitter)
    .map((t) => normalizeToken(t, v))
    .filter(Boolean);
  // Harf arası ayırıcı: ≥3 tek harflik kelime art arda → birleşik kelime de eklenir ("a m k" → "amk").
  const joined: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) joined.push(collapse(run.join('')));
    run = [];
  };
  for (const t of tokens) {
    if (t.length === 1) run.push(t);
    else flush();
  }
  flush();
  return joined.length ? [...tokens, ...joined] : tokens;
}

/** Ayırıcısız tüm metin (contains terimleri için): "o.r.o.s.p.u" → "orospu". */
function compactText(lowered: string, v: TermVariant): string {
  let out = '';
  for (const ch of lowered) out += LEET[ch] ?? ch;
  return collapse(foldChars(out.replace(/[^\p{L}]/gu, ''), v));
}

/** Terimin bir kelimesini sözlük biçimine çevirir (metinle aynı kurallar). */
export function normalizeTermWord(word: string, v: TermVariant = 'fold'): string {
  return normalizeToken(lowerTr(word.trim()), v).replace(/\*/g, '');
}

export function compileDictionary(terms: readonly FilterTerm[], allow: readonly string[] = []): CompiledDictionary {
  const compiled: CompiledTerm[] = [];
  for (const term of terms) {
    const v = term.v ?? 'fold';
    const words = term.t.split(/\s+/).map((w) => normalizeTermWord(w, v)).filter(Boolean);
    if (!words.length) continue;
    compiled.push({ words, joined: words.join(''), m: term.m, l: term.l, c: term.c, v });
  }
  const allowSet = new Set<string>();
  for (const a of allow) for (const v of VARIANTS) allowSet.add(normalizeTermWord(a, v));
  return { terms: compiled, allow: allowSet };
}

function wordMatches(token: string, w: string, m: TermMatch): boolean {
  if (m === 'exact') return token === w;
  if (m === 'prefix') return token.startsWith(w);
  return token.includes(w);
}

/** '*' tek harf joker: maskeli kelime terimle (kural kipinde) uyuşuyor mu. */
function wildcardMatches(token: string, w: string, m: TermMatch): boolean {
  const fits = (offset: number) => {
    for (let i = 0; i < w.length; i++) {
      const c = token[offset + i];
      if (c === undefined || (c !== '*' && c !== w[i])) return false;
    }
    return true;
  };
  if (m === 'exact') return token.length === w.length && fits(0);
  if (m === 'prefix') return fits(0);
  for (let o = 0; o + w.length <= token.length; o++) if (fits(o)) return true;
  return false;
}

type Prepared = { tokens: string[]; sequence: string[]; compact: string };

function prepare(text: string): Record<TermVariant, Prepared> {
  const lowered = lowerTr(text);
  const out = {} as Record<TermVariant, Prepared>;
  for (const v of VARIANTS) {
    const a = tokenize(lowered, v, false);
    const b = tokenize(lowered, v, true);
    out[v] = { tokens: [...new Set([...a, ...b])], sequence: b, compact: compactText(lowered, v) };
  }
  return out;
}

function phraseMatches(seq: readonly string[], term: CompiledTerm, allow: Set<string>): boolean {
  const n = term.words.length;
  for (let i = 0; i + n <= seq.length; i++) {
    let ok = true;
    for (let k = 0; k < n && ok; k++) {
      const tok = seq[i + k];
      ok = k < n - 1 ? tok === term.words[k] : !allow.has(tok) && wordMatches(tok, term.words[k], term.m);
    }
    if (ok) return true;
  }
  return false;
}

/** Metni sözlüğe göre değerlendirir. Eşleşen kelime döndürülmez (kullanıcıya hangi kelimenin engellendiği söylenmez). */
export function analyzeText(text: string, dict: CompiledDictionary): FilterVerdict {
  if (!text || !text.trim()) return { level: 'ok', categories: [] };
  const prepared = prepare(text);
  let level: FilterVerdict['level'] = 'ok';
  const categories = new Set<string>();
  const hit = (l: TermLevel, c: string) => {
    categories.add(c);
    if (l === 'block') level = 'block';
    else if (level === 'ok') level = 'flag';
  };

  for (const term of dict.terms) {
    const p = prepared[term.v];
    let matched = false;
    if (term.words.length === 1) {
      const w = term.words[0];
      matched = p.tokens.some((t) => !t.includes('*') && !dict.allow.has(t) && wordMatches(t, w, term.m));
      if (!matched && term.m === 'contains' && w.length >= 5) matched = p.compact.includes(w);
      if (!matched && w.length >= 5) {
        // Yıldızla sansürlenmiş kelime: ORTA (kullanıcı kendisi sansürlemiş; yanlış pozitife karşı yalnız işaret).
        const masked = p.tokens.some((t) => {
          const stars = (t.match(/\*/g) ?? []).length;
          return stars > 0 && stars <= Math.floor(w.length / 3) && wildcardMatches(t, w, term.m);
        });
        if (masked) {
          hit('flag', term.c);
          continue;
        }
      }
    } else {
      matched = phraseMatches(p.sequence, term, dict.allow);
      if (!matched && term.m === 'contains') matched = p.compact.includes(term.joined);
    }
    if (matched) hit(term.l, term.c);
  }
  return { level, categories: [...categories].sort() };
}

// ── Bağlantı ve tekrar (spam) ───────────────────────────────────────────────────────────────────────────────────────

const LINK_RE =
  /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|net|org|io|co|xyz|bet|tv|me|info|biz|tr|ly|gg|link|site|online|club|vip|app|live|top|win|pro|shop)\b(?:\/[^\s]*)?/giu;

/** Metindeki bağlantı sayısı (şemalı, www. ile başlayan ya da yaygın uzantılı çıplak alan adları). */
export function countLinks(text: string): number {
  return (text.match(LINK_RE) ?? []).length;
}

/** Tekrar karşılaştırması için kaba parmak izi: küçük harf, Türkçe katlama, yalnız harf/rakam, tekrar tekleşir. */
export function duplicateFingerprint(text: string): string {
  return collapse(foldChars(lowerTr(text), 'fold').replace(/[^\p{L}\p{N}]/gu, ''));
}
