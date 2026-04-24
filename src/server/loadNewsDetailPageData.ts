import type { NewsItem } from '@/models/domain';
import { getCachedNews } from '@/services/newsCache';

export type NewsDetailPageServerPayload = {
  article: NewsItem;
  sidebarNews: NewsItem[];
};

export async function loadNewsDetailPageData(
  id: string
): Promise<NewsDetailPageServerPayload | null> {
  try {
    const items = await getCachedNews();
    const article = items.find((n) => n.id === id) ?? null;
    if (!article) return null;
    const sidebarNews = items.filter((n) => n.id !== id).slice(0, 5);
    return { article, sidebarNews };
  } catch (e) {
    console.error('loadNewsDetailPageData', e);
    return null;
  }
}
