import type { NewsItem } from '@/models/domain';

export async function getNews(limit = 20): Promise<NewsItem[]> {
  const res = await fetch(`/api/news?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.success ? data.items : [];
}

export async function getNewsById(id: string): Promise<NewsItem | null> {
  const res = await fetch(`/api/news/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.success ? data.item : null;
}
