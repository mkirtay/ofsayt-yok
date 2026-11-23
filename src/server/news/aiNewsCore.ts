/**
 * AI haber hattının saf parçaları (ağ/LLM yok → birim testli): tazelik süzgeci, aday listesi metni, seçim/yazım
 * yanıtlarının çözümlenmesi, depo birleştirme. Hat: server/news/aiNews.ts.
 */
import type { NewsItem } from '@/models/domain';

/** Ana sayfa ve liste: en fazla 1 günlük haber. */
export const NEWS_MAX_AGE_MS = 24 * 60 * 60_000;
/** Detay bağlantıları 1 günü biraz aşsın diye depoda tutulma süresi (listede gösterilmez). */
export const NEWS_KEEP_MS = 48 * 60 * 60_000;
/** RSS saatinde küçük ileri kaymaya tolerans (yayıncı saat dilimi hataları). */
const FUTURE_TOLERANCE_MS = 10 * 60_000;

export type NewsCandidate = {
  id: string;
  sourceId: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  image?: string;
};

/** Yayın zamanı geçerli ve `maxAgeMs` içinde mi (geleceğe 10 dk tolerans). */
export function isFresh(publishedAt: string, now: number, maxAgeMs = NEWS_MAX_AGE_MS): boolean {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return false;
  return t <= now + FUTURE_TOLERANCE_MS && now - t <= maxAgeMs;
}

/** En yeni en üstte. */
export function sortNewestFirst<T extends { publishedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/** Seçim adımına giden kısa aday satırları: `[n] (Kaynak, HH:MM) Başlık — özet`. */
export function candidateLines(cands: NewsCandidate[]): string {
  return cands
    .map((c, i) => {
      const time = new Date(c.publishedAt).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Istanbul',
      });
      const snippet = c.snippet.replace(/\s+/g, ' ').trim().slice(0, 200);
      return `[${i}] (${c.source}, ${time}) ${c.title}${snippet ? ` — ${snippet}` : ''}`;
    })
    .join('\n');
}

export type StoryPick = { indexes: number[] };

/** Seçim yanıtı `{"stories":[{"indexes":[3,7]}, …]}` → geçerli, tekrarsız aday indeksleri. */
export function parseStoryPicks(raw: unknown, candidateCount: number, max: number): StoryPick[] {
  const stories = (raw as { stories?: unknown })?.stories;
  if (!Array.isArray(stories)) return [];
  const used = new Set<number>();
  const out: StoryPick[] = [];
  for (const s of stories) {
    const idx = (s as { indexes?: unknown })?.indexes;
    if (!Array.isArray(idx)) continue;
    const valid = idx.filter(
      (n): n is number => Number.isInteger(n) && n >= 0 && n < candidateCount && !used.has(n),
    );
    if (!valid.length) continue;
    valid.forEach((n) => used.add(n));
    out.push({ indexes: [...new Set(valid)] });
    if (out.length >= max) break;
  }
  return out;
}

export type WrittenArticle = {
  title: string;
  summary: string;
  paragraphs: string[];
  keyPoints: string[];
};

/**
 * Model web araması sonrası metne bazen alıntı etiketi yazıyor (`<cite index="3-4">…</cite>`, bozuk biçimi
 * `(cite index="3-4">…`). Etiketler atılır, içerik kalır; kalan çift boşluk ve boş parantez temizlenir.
 */
export function cleanText(s: string): string {
  return s
    .replace(/<?\/\s*cite\s*>?\)?/gi, '')
    .replace(/\(?\s*<?\s*cite\b[^>]*>/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Yazım yanıtındaki `<article_json>{…}</article_json>` bloğunu (yoksa ilk `{…}`) çözer; eksik/kısa yazıyı reddeder. */
export function parseWrittenArticle(text: string): WrittenArticle | null {
  const tagged = text.match(/<article_json>([\s\S]*?)<\/article_json>/)?.[1];
  const candidate = tagged ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!candidate || !candidate.trim()) return null;
  let data: unknown;
  try {
    data = JSON.parse(candidate.trim());
  } catch {
    return null;
  }
  const d = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? cleanText(v) : '');
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map(str).filter((x) => x.length > 0) : [];
  const title = str(d.title);
  const summary = str(d.summary);
  const paragraphs = list(d.paragraphs);
  const keyPoints = list(d.keyPoints).slice(0, 6);
  const words = paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  // "Hafif içerik olmasın": en az 3 paragraf ve ~180 kelime; altı yayınlanmaz.
  if (!title || !summary || paragraphs.length < 3 || words < 180) return null;
  return { title, summary, paragraphs, keyPoints };
}

/** Depo + yeni haberler: id tekil, `NEWS_KEEP_MS`'ten eskiler atılır, en yeni en üstte. */
export function mergeStore(existing: NewsItem[], added: NewsItem[], now: number): NewsItem[] {
  const byId = new Map<string, NewsItem>();
  for (const it of [...added, ...existing]) if (!byId.has(it.id)) byId.set(it.id, it);
  return sortNewestFirst([...byId.values()].filter((n) => isFresh(n.publishedAt, now, NEWS_KEEP_MS)));
}

/** Depodaki haberlerin kapsadığı kaynak URL'leri (aynı haber ikinci kez yazılmasın). */
export function coveredUrls(store: NewsItem[]): Set<string> {
  const set = new Set<string>();
  for (const n of store) {
    if (n.url) set.add(n.url);
    for (const s of n.sources ?? []) set.add(s.url);
  }
  return set;
}

/** Kararlı haber id'si: birincil kaynak URL'sinden kısa özet. */
export function storyId(primaryUrl: string): string {
  let h = 0;
  for (let i = 0; i < primaryUrl.length; i++) h = ((h << 5) - h + primaryUrl.charCodeAt(i)) | 0;
  return `h${Math.abs(h).toString(36)}`;
}

/** Kaynak listesi: URL ve ad bakımından tekil, en çok `max` (önce RSS kaynakları). */
export function uniqueSources(list: { name: string; url: string }[], max = 6): { name: string; url: string }[] {
  const names = new Set<string>();
  const urls = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const s of list) {
    if (!s.url || urls.has(s.url) || names.has(s.name)) continue;
    urls.add(s.url);
    names.add(s.name);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Claude Haiku 5.5 fiyatı (istem ≤ 100K token; 2026-11): girdi $0.10/MTok, çıktı $0.50/MTok, önbellek okuma girdinin
 * %10'u, web araması $10 / 1000. Döndürülen birim mikro-dolar (Redis INCRBY tam sayı ister).
 */
export const HAIKU_PRICE = { inputPerM: 0.1, outputPerM: 0.5, cacheReadPerM: 0.01, cacheWritePerM: 0.125, perSearch: 0.01 };

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function usageCostMicroUsd(u: UsageLike): number {
  const p = HAIKU_PRICE;
  const usd =
    (u.input_tokens * p.inputPerM +
      u.output_tokens * p.outputPerM +
      (u.cache_read_input_tokens ?? 0) * p.cacheReadPerM +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWritePerM) /
      1_000_000 +
    (u.server_tool_use?.web_search_requests ?? 0) * p.perSearch;
  return Math.ceil(usd * 1_000_000);
}

/** Kalan günlük bütçeyle bu çalışmada yazılabilecek haber sayısı (haber başına tahmini maliyetle). */
export function writesAffordable(remainingMicroUsd: number, perArticleMicroUsd: number, max: number): number {
  if (remainingMicroUsd <= 0) return 0;
  return Math.max(0, Math.min(max, Math.floor(remainingMicroUsd / perArticleMicroUsd)));
}

/** Depo bu sayının altındaysa (son 24 sa) çalışma başına daha çok haber yazılır: deploy/ilk gün ya da sakin saatler. */
export const NEWS_THIN_STORE = 12;

/** Bu çalışmada yazılacak en çok yeni haber: zayıf depoda 6, doluyken 3. */
export function maxNewForRun(freshCount: number): number {
  return freshCount < NEWS_THIN_STORE ? 6 : 3;
}

// ─── Aynı olay koruması ────────────────────────────────────────────────────
// Seçim modeli "yayınlanmış olayı tekrar seçme" talimatını her zaman tutmuyor (2026-11-23: GS–Aston Villa için iki ayrı
// haber yazıldı: "maç önü" ve "kadroda 3 eksik"). Kod da özel adlarla (takım/kişi/yer) ikinci bir eleme yapar.

/** Özel ad sayılmayan, sık büyük harfli sözcükler (turnuva adları, cümle başı kalıpları). */
const ENTITY_STOPWORDS = new Set([
  'şampiyonlar', 'ligi', 'lig', 'süper', 'premier', 'dünya', 'kupası', 'kupa', 'milli', 'takım', 'takımı', 'uefa',
  'avrupa', 'konferans', 'trendyol', 'laliga', 'serie', 'bundesliga', 'fifa', 'tff', 'var', 'türkiye', 'bu', 'maç',
  'maçı', 'maçın', 'maçında', 'teknik', 'sezon', 'kulüp', 'yeni', 'son', 'ilk', 'sarı', 'siyah', 'bordo', 'the',
]);

/** Metindeki özel adlar: büyük harfle başlayan sözcükler, kesme ekinden arındırılmış, küçük harf (tr). */
export function entityTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/[^A-Za-zÇĞİÖŞÜçğıöşüâîûÂÎÛ'’-]+/)) {
    const word = raw.split(/['’]/)[0].replace(/-+$/, '');
    if (word.length < 3 || !/^[A-ZÇĞİÖŞÜÂÎÛ]/.test(word)) continue;
    const t = word.toLocaleLowerCase('tr');
    if (!ENTITY_STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/**
 * Aday başlık, yayınlanmış bir haberle (başlık + özet) aynı olayı mı anlatıyor: başlıktaki özel adların en az 2'si ve
 * en az %75'i o haberde geçiyorsa evet. Tek ortak takım adı yetmez ("Fenerbahçe … Aziz Yıldırım" ≠ "Fenerbahçe … Archie
 * Brown"); "Okan Buruk, Aston Villa maçında …" ↔ "Galatasaray yarın Aston Villa'yı ağırlıyor … Okan Buruk …" aynı.
 */
export function isSameEvent(title: string, published: { title: string; summary?: string }): boolean {
  const a = entityTokens(title);
  if (a.size < 2) return false;
  const b = entityTokens(`${published.title} ${published.summary ?? ''}`);
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared >= 2 && shared >= Math.ceil(a.size * 0.75);
}

export function findSameEvent<T extends { title: string; summary?: string }>(title: string, list: T[]): T | undefined {
  return list.find((p) => isSameEvent(title, p));
}
