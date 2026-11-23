import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NewsItem } from '@/models/domain';
import HomeNewsCard from './index';

function render(items?: NewsItem[]) {
  const qc = new QueryClient();
  if (items) qc.setQueryData(['news-latest', 3], items);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <HomeNewsCard />
    </QueryClientProvider>,
  );
}

const item = (id: string, minsAgo: number, image?: string): NewsItem => ({
  id,
  title: `Başlık ${id}`,
  url: `https://x.test/${id}`,
  source: 'A Spor',
  publishedAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
  image,
});

describe('<HomeNewsCard />', () => {
  it('yüklenirken 3 satırlık iskelet + başlık ve "Tümü" bağlantısı', () => {
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/skeletonRow/g)).toHaveLength(3);
    expect(html).toContain('href="/news"');
  });

  it('haberler sırayla detay bağlantısıyla çizilir; görselsiz satırda img yok', () => {
    const html = render([item('a', 5, 'https://img.test/a.jpg'), item('b', 90)]);
    expect(html.indexOf('/news/a')).toBeLessThan(html.indexOf('/news/b'));
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('Başlık b');
  });

  it('haber yoksa kart hiç çizilmez', () => {
    expect(render([])).toBe('');
  });
});
