/**
 * AI haber hattı (ana sayfa sağ panel "Haberler" + /news):
 *
 * 1. RSS adayları (config/newsSources.ts) — yalnız son 24 saat.
 * 2. Seçim: Claude Haiku 5.5, yapılandırılmış çıktı — futbol dışını/galeriyi/magazini eler, aynı olayı anlatan adayları
 *    tek haberde toplar, önem sırasıyla en çok `MAX_NEW_PER_RUN` YENİ haber seçer (depoda olanlar tekrar yazılmaz).
 * 3. Yazım: haber başına Haiku 5.5 + web araması (en çok 2 arama) + kaynak sayfanın metni → ayrıntılı Türkçe yazı
 *    (başlık, özet, 5–8 paragraf, öne çıkanlar). Kısa/eksik yazı yayınlanmaz (aiNewsCore.parseWrittenArticle).
 * 4. Depo: Redis tek anahtar (48 sa tutulur; liste 24 sa süzer), en yeni en üstte.
 *
 * Tetik: /api/cron/news-refresh (CRON_SECRET) ve /api/news okumasında arka planda (son çalışma 15 dk'dan eskiyse).
 * Kilit + günlük yazım tavanı maliyeti sınırlar. ANTHROPIC_API_KEY yoksa hat çalışmaz, panel gizlenir.
 */
import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { captureError } from '@/lib/logger';
import { fitsInRedis, withRedis } from '@/lib/redis';
import type { NewsItem } from '@/models/domain';
import { fetchNewsCandidates } from '@/services/newsService';
import {
  candidateLines,
  coveredUrls,
  isFresh,
  mergeStore,
  parseStoryPicks,
  parseWrittenArticle,
  storyId,
  type NewsCandidate,
  type WrittenArticle,
} from './aiNewsCore';

export const NEWS_MODEL = 'claude-haiku-5-5';
const MAX_NEW_PER_RUN = 4;
const MAX_CANDIDATES = 90;
const DAILY_WRITE_CAP = 80;
export const NEWS_REFRESH_INTERVAL_MS = 15 * 60_000;
const LOCK_TTL_SEC = 150;
const STORE_TTL_SEC = 3 * 24 * 60 * 60;

const keys = () => {
  const p = `${cacheKeyPrefix()}news:ai:v1:`;
  return { store: `${p}store`, lastRun: `${p}last-run`, lock: `${p}lock`, daily: (d: string) => `${p}writes:${d}` };
};

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 90_000 });
  return client;
}

export function aiNewsEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ─── Depo ──────────────────────────────────────────────────────────────────

export async function readNewsStore(): Promise<NewsItem[]> {
  return (await withRedis((r) => r.get<NewsItem[]>(keys().store), null)) ?? [];
}

/** Liste: son 24 saat, en yeni en üstte. */
export async function getLatestNews(now: number = Date.now()): Promise<NewsItem[]> {
  return (await readNewsStore()).filter((n) => isFresh(n.publishedAt, now));
}

/** Son çalışma `NEWS_REFRESH_INTERVAL_MS`'ten eskiyse true (Redis yoksa false: arka plan tetiklenmez). */
export async function newsRefreshDue(now: number = Date.now()): Promise<boolean> {
  if (!aiNewsEnabled()) return false;
  const last = await withRedis((r) => r.get<number>(keys().lastRun), now);
  return now - Number(last ?? 0) >= NEWS_REFRESH_INTERVAL_MS;
}

// ─── Kaynak sayfa metni ─────────────────────────────────────────────────────

/** Haber sayfasının gövde paragrafları (en çok ~6000 karakter); alınamazsa boş. */
async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scor3News/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(6_000),
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const $ = cheerio.load(await res.text());
    $('script, style, noscript, aside, nav, footer, header, figure, form').remove();
    const scoped = $('article p, [itemprop="articleBody"] p, .news-content p, .detail-content p, .content-text p');
    const nodes = scoped.length >= 3 ? scoped : $('p');
    const parts: string[] = [];
    nodes.each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length >= 40) parts.push(t);
    });
    return parts.join('\n').slice(0, 6_000);
  } catch {
    return '';
  }
}

// ─── Seçim ─────────────────────────────────────────────────────────────────

const SELECT_SYSTEM = `Sen bir Türk futbol sitesinin (Scor3) haber editörüsün. Sana son 24 saatte yayınlanmış RSS haber adayları verilecek.
Görevin: sitede yayınlanacak, birbirinden FARKLI, en önemli FUTBOL haberlerini seçmek.

Kurallar:
- Yalnız futbol. Basketbol, voleybol, Formula 1, tenis vb. ele.
- Foto galeri, magazin, köşe yazısı/yorum, "işte maçın şifresi" türü tık tuzağı, bahis/iddaa içerikli haberleri ele.
- Aynı olayı anlatan adayları TEK haberde birleştir (indexes listesine hepsini koy; ilk indeks en ayrıntılı görünen aday olsun).
- "Zaten yayınlanan haberler" listesindeki bir olayı tekrar seçme.
- Öncelik: Süper Lig ve Türk takımları, Türk takımlarının Avrupa maçları, milli takım, Türk oyuncular; ardından Avrupa'nın büyük ligleri ve büyük gelişmeleri (transfer, sakatlık, teknik direktör değişikliği, önemli maç sonuçları, açıklamalar).
- Önem sırasına göre sırala. Dikkate değer haber yoksa boş liste döndür.`;

const SELECT_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { indexes: { type: 'array', items: { type: 'integer' } } },
        required: ['indexes'],
        additionalProperties: false,
      },
    },
  },
  required: ['stories'],
  additionalProperties: false,
} as const;

async function selectStories(
  ai: Anthropic,
  cands: NewsCandidate[],
  published: NewsItem[],
  max: number,
): Promise<NewsCandidate[][]> {
  const publishedList = published.length ? published.map((n) => `- ${n.title}`).join('\n') : '(yok)';
  const res = await ai.messages.create({
    model: NEWS_MODEL,
    max_tokens: 4_000,
    system: SELECT_SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SELECT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Zaten yayınlanan haberler:\n${publishedList}\n\nAdaylar:\n${candidateLines(cands)}\n\nEn çok ${max} yeni haber seç.`,
      },
    ],
  });
  if (res.stop_reason === 'refusal') return [];
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return parseStoryPicks(parsed, cands.length, max).map((p) => p.indexes.map((i) => cands[i]));
}

// ─── Yazım ─────────────────────────────────────────────────────────────────

const WRITE_SYSTEM = `Sen Scor3'ün futbol muhabirisin. Verilen kaynak haberlerden ve web aramasından yararlanarak Türkçe, ayrıntılı ve özgün bir haber yazısı yazarsın.

İçerik:
- Yalnız kaynaklarda geçen ya da web aramasıyla doğruladığın bilgileri yaz. Emin olmadığın ayrıntıyı (skor, dakika, rakam, isim, tarih) yazma; tahmin yürütme.
- Hafif bir özet değil, dolu bir haber yaz: ne oldu → ayrıntılar (isimler, skorlar, goller ve dakikaları, istatistikler, sözleşme/bonservis rakamları, yapılan açıklamaların özü) → arka plan ve bağlam (puan durumu, sezonun gidişatı, önceki gelişmeler, kulübün/oyuncunun durumu) → sırada ne var (sonraki maç, süreç, beklenen karar).
- Web aramasını (en çok 2 kez) eksik bağlamı tamamlamak ve kaynaklar çelişirse doğrulamak için kullan.
- Kendi cümlelerinle yaz; kaynak metni kopyalama. Doğrudan alıntı en fazla bir kısa cümle olabilir, tırnak içinde ve kime ait olduğu belirtilerek.
- Bahis, iddaa, oran, kupon dili kullanma. Tık tuzağı başlık kullanma. Kaynağın adını ("... sitesine göre") metne yazma.
- Kaynak metinlerde sayfadan gelen konu dışı cümleler (başka haberlerin parçaları) olabilir; başlıktaki olayla ilgisi olmayanları yok say.
- Kaynak İngilizceyse Türkçeye çevirerek yaz.

Biçim (yalnız bunu döndür, başka metin yok):
<article_json>{"title": "...", "summary": "...", "paragraphs": ["...", "..."], "keyPoints": ["...", "..."]}</article_json>
- title: en çok 90 karakter, bilgi veren başlık.
- summary: 2 cümlelik özet (ana sayfadaki kartta görünür).
- paragraphs: 5–8 paragraf, toplam 350–600 kelime.
- keyPoints: 3–5 kısa madde (öne çıkan bilgiler).`;

type WriteResult = { article: WrittenArticle; searchSources: { name: string; url: string }[] };

function hostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function writeStory(ai: Anthropic, group: NewsCandidate[]): Promise<WriteResult | null> {
  const texts = await Promise.all(group.slice(0, 3).map((c) => fetchArticleText(c.url)));
  const sourceBlocks = group
    .slice(0, 3)
    .map((c, i) => {
      const body = texts[i] || c.snippet || '(metin alınamadı)';
      const when = new Date(c.publishedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
      return `<kaynak ad="${c.source}" zaman="${when}">\nBaşlık: ${c.title}\n${body}\n</kaynak>`;
    })
    .join('\n\n');
  const today = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full' });

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Bugün: ${today}\n\n${sourceBlocks}\n\nBu olay hakkında haberi yaz.` },
  ];
  const tools: Anthropic.ToolUnion[] = [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 2,
      user_location: { type: 'approximate', country: 'TR', timezone: 'Europe/Istanbul' },
    },
  ];

  let res: Anthropic.Message | null = null;
  const content: Anthropic.ContentBlock[] = [];
  for (let i = 0; i < 3; i++) {
    res = await ai.messages.create({
      model: NEWS_MODEL,
      max_tokens: 16_000,
      system: WRITE_SYSTEM,
      output_config: { effort: 'medium' },
      tools,
      messages,
    });
    content.push(...res.content);
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  if (!res || res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;

  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const article = parseWrittenArticle(text);
  if (!article) return null;

  const searchSources: { name: string; url: string }[] = [];
  for (const b of content) {
    if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue;
    for (const r of b.content) {
      if (r.type === 'web_search_result') searchSources.push({ name: hostName(r.url), url: r.url });
    }
  }
  return { article, searchSources };
}

function toNewsItem(group: NewsCandidate[], written: WriteResult): NewsItem {
  const primary = group[0];
  const newest = group.reduce((a, b) => (Date.parse(b.publishedAt) > Date.parse(a.publishedAt) ? b : a));
  const rssSources = group.map((c) => ({ name: c.source, url: c.url }));
  const seen = new Set(rssSources.map((s) => s.url));
  const extra = written.searchSources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 3);
  return {
    id: storyId(primary.url),
    title: written.article.title,
    url: primary.url,
    source: primary.source,
    publishedAt: newest.publishedAt,
    summary: written.article.summary,
    content: written.article.paragraphs.join('\n'),
    keyPoints: written.article.keyPoints,
    image: group.find((c) => c.image)?.image,
    sources: [...rssSources, ...extra],
    ai: true,
  };
}

// ─── Çalıştırma ────────────────────────────────────────────────────────────

export type NewsRefreshSummary = {
  skipped?: 'disabled' | 'locked' | 'cap';
  candidates?: number;
  selected?: number;
  written?: number;
  failed?: number;
  total?: number;
};

export async function refreshNews(now: number = Date.now()): Promise<NewsRefreshSummary> {
  const ai = anthropic();
  if (!ai) return { skipped: 'disabled' };
  const k = keys();
  // Redis yoksa kilit alınmış sayılır (yerel geliştirme); depo da yazılamaz, yine de çalışma görülebilir.
  const locked = await withRedis((r) => r.set(k.lock, String(now), { nx: true, ex: LOCK_TTL_SEC }), 'OK');
  if (locked !== 'OK') return { skipped: 'locked' };
  await withRedis((r) => r.set(k.lastRun, now, { ex: STORE_TTL_SEC }), null);

  try {
    const day = new Date(now).toISOString().slice(0, 10);
    const writesToday = Number((await withRedis((r) => r.get<number>(k.daily(day)), 0)) ?? 0);
    const room = Math.min(MAX_NEW_PER_RUN, DAILY_WRITE_CAP - writesToday);

    const store = await readNewsStore();
    const covered = coveredUrls(store);
    const cands = (await fetchNewsCandidates(now)).filter((c) => !covered.has(c.url)).slice(0, MAX_CANDIDATES);
    if (room <= 0) {
      await saveStore(mergeStore(store, [], now));
      return { skipped: 'cap', candidates: cands.length };
    }

    const published = store.filter((n) => isFresh(n.publishedAt, now));
    const groups = cands.length ? await selectStories(ai, cands, published, room) : [];
    const results = await Promise.allSettled(groups.map((g) => writeStory(ai, g)));
    const added: NewsItem[] = [];
    let failed = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) added.push(toNewsItem(groups[i], r.value));
      else {
        failed++;
        if (r.status === 'rejected') captureError('news-write', r.reason);
      }
    });

    const next = mergeStore(store, added, now);
    await saveStore(next);
    if (added.length) {
      await withRedis(async (r) => {
        await r.incrby(k.daily(day), added.length);
        await r.expire(k.daily(day), 2 * 24 * 60 * 60);
      }, null);
    }
    return { candidates: cands.length, selected: groups.length, written: added.length, failed, total: next.length };
  } finally {
    await withRedis((r) => r.del(k.lock), null);
  }
}

async function saveStore(items: NewsItem[]): Promise<void> {
  if (!fitsInRedis(items)) return;
  await withRedis((r) => r.set(keys().store, items, { ex: STORE_TTL_SEC }), null);
}
