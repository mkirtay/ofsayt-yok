import type { NewsItem } from '@/models/domain';

export async function getNews(limit = 20): Promise<NewsItem[]> {
  const res = await fetch(`/api/news?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.success ? data.items : [];
}
