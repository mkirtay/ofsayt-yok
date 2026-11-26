import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  createMany: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { newsArticle: db } }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import { getArchivedNews, isMissingNewsTable, rowToNewsItem, saveNewsArticles } from './newsArchive';
import { newsSection } from '@/server/sitemap/sections';
import type { NewsItem } from '@/models/domain';

const row = {
  id: 'habc',
  title: 'Başlık',
  url: 'https://x.test/1',
  source: 'A Spor',
  publishedAt: new Date('2026-11-23T09:00:00Z'),
  summary: 'Özet.',
  content: 'P1\nP2',
  keyPoints: ['a'],
  sources: [{ name: 'A Spor', url: 'https://x.test/1' }, { bozuk: true }],
  image: null,
};

describe('newsArchive', () => {
  it('satır → NewsItem: bozuk kaynak atılır, görsel yoksa alan yok', () => {
    const n = rowToNewsItem(row);
    expect(n.publishedAt).toBe('2026-11-23T09:00:00.000Z');
    expect(n.sources).toEqual([{ name: 'A Spor', url: 'https://x.test/1' }]);
    expect('image' in n).toBe(false);
    expect(n.ai).toBe(true);
  });

  it('yalnız tam metinli AI haberleri yazılır, tekrar atlanır', async () => {
    db.createMany.mockResolvedValueOnce({ count: 1 });
    const items: NewsItem[] = [
      { ...rowToNewsItem(row) },
      { id: 'rss', title: 'RSS', url: 'u', source: 's', publishedAt: '2026-11-23T09:00:00Z' },
    ];
    expect(await saveNewsArticles(items)).toBe(1);
    const arg = db.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.map((d: { id: string }) => d.id)).toEqual(['habc']);
  });

  it('tablo yoksa sessizce boş döner', async () => {
    const missing = Object.assign(new Error('The table `public.NewsArticle` does not exist'), { code: 'P2021' });
    expect(isMissingNewsTable(missing)).toBe(true);
    db.findUnique.mockRejectedValueOnce(missing);
    expect(await getArchivedNews('habc')).toBeNull();
    db.createMany.mockRejectedValueOnce(missing);
    expect(await saveNewsArticles([rowToNewsItem(row)])).toBe(0);
  });

  it('sitemap haber bölümü: /news + her haber, lastmod yayın anı', async () => {
    db.findMany.mockResolvedValueOnce([{ id: 'habc', publishedAt: row.publishedAt }]);
    const urls = await newsSection();
    expect(urls[0].loc).toMatch(/\/news$/);
    expect(urls[1]).toMatchObject({ loc: expect.stringMatching(/\/news\/habc$/), lastmod: '2026-11-23T09:00:00.000Z' });
  });
});
