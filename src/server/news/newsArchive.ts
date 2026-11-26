/**
 * AI haber arşivi (Postgres `NewsArticle`): haber sayfaları SEO için kalıcı. Redis deposu (aiNews.ts) yalnız son 48 saati
 * tutar ve ana sayfa / liste ondan okur; detay sayfası, sitemap ve IndexNow bu tablodan.
 * Tablo yoksa (migration uygulanmadan deploy) her işlev sessizce boş döner — haberler Redis'ten çalışmaya devam eder.
 */
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY } from '@/config/indexNow';
import { cacheEnv } from '@/lib/cacheNamespace';
import { captureError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { NewsItem } from '@/models/domain';

/** Tablo yok (migration uygulanmamış): Prisma P2021 ya da Postgres 42P01. */
export function isMissingNewsTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { code?: string } } | null;
  if (!e) return false;
  return e.code === 'P2021' || e.code === '42P01' || e.meta?.code === '42P01' || /NewsArticle.*does not exist/i.test(e.message ?? '');
}

type Row = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  summary: string;
  content: string;
  keyPoints: string[];
  sources: unknown;
  image: string | null;
};

export function rowToNewsItem(r: Row): NewsItem {
  const sources = Array.isArray(r.sources)
    ? (r.sources as { name?: unknown; url?: unknown }[]).flatMap((s) =>
        typeof s?.name === 'string' && typeof s?.url === 'string' ? [{ name: s.name, url: s.url }] : [],
      )
    : [];
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source,
    publishedAt: r.publishedAt.toISOString(),
    summary: r.summary,
    content: r.content,
    keyPoints: r.keyPoints,
    sources,
    ...(r.image ? { image: r.image } : {}),
    ai: true,
  };
}

/** Yalnız AI haberleri (tam metinli) arşive girer; zaten olanlar atlanır. Yazılan satır sayısı. */
export async function saveNewsArticles(items: NewsItem[]): Promise<number> {
  const rows = items
    .filter((n) => n.ai && n.content && n.summary)
    .map((n) => ({
      id: n.id,
      title: n.title,
      url: n.url,
      source: n.source,
      publishedAt: new Date(n.publishedAt),
      summary: n.summary ?? '',
      content: n.content ?? '',
      keyPoints: n.keyPoints ?? [],
      sources: n.sources ?? [],
      image: n.image ?? null,
    }));
  if (!rows.length) return 0;
  try {
    const r = await prisma.newsArticle.createMany({ data: rows, skipDuplicates: true });
    return r.count;
  } catch (e) {
    if (!isMissingNewsTable(e)) captureError('news-archive-save', e);
    return 0;
  }
}

export async function getArchivedNews(id: string): Promise<NewsItem | null> {
  try {
    const r = await prisma.newsArticle.findUnique({ where: { id } });
    return r ? rowToNewsItem(r) : null;
  } catch (e) {
    if (!isMissingNewsTable(e)) captureError('news-archive-get', e);
    return null;
  }
}

/** Sitemap: en yeni haberler (id + yayın zamanı). */
export async function listArchivedNewsForSitemap(limit = 5_000): Promise<{ id: string; publishedAt: Date }[]> {
  try {
    return await prisma.newsArticle.findMany({
      select: { id: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  } catch (e) {
    if (!isMissingNewsTable(e)) captureError('news-archive-sitemap', e);
    return [];
  }
}

export function newsPath(id: string): string {
  return `/news/${encodeURIComponent(id)}`;
}

/**
 * Yeni haberleri IndexNow'a bildirir (Bing/Yandex; ChatGPT ve Copilot araması Bing dizininden). Yalnız canlıda (prod),
 * hata yutulur — haber yazımını bekletmez.
 */
export async function pingIndexNow(ids: string[]): Promise<void> {
  if (!ids.length || cacheEnv() !== 'prod') return;
  try {
    const base = siteBaseUrl();
    await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(base).host,
        key: INDEXNOW_KEY,
        keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
        urlList: ids.map((id) => `${base}${newsPath(id)}`),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    captureError('news-indexnow', e);
  }
}
