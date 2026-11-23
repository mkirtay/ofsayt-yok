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
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
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
