export interface NewsSource {
  id: string;
  name: string;
  rssUrl: string;
  active: boolean;
  lang: 'tr' | 'en';
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'sabah',
    name: 'Sabah Spor',
    rssUrl: 'https://www.sabah.com.tr/rss/spor.xml',
    active: true,
    lang: 'tr',
  },
  {
    id: 'hurriyet',
    name: 'Hürriyet Spor',
    rssUrl: 'https://www.hurriyet.com.tr/rss/spor',
    active: true,
    lang: 'tr',
  },
  {
    id: 'haberturk',
    name: 'Habertürk Spor',
    rssUrl: 'https://www.haberturk.com/rss/spor.xml',
    active: true,
    lang: 'tr',
  },
  {
    id: 'cnnturk',
    name: 'CNN Türk Spor',
    rssUrl: 'https://www.cnnturk.com/feed/rss/spor/news',
    active: true,
    lang: 'tr',
  },
  {
    id: 'bbc',
    name: 'BBC Sport',
    rssUrl: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    active: true,
    lang: 'en',
  },
];
