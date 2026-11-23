export interface NewsSource {
  id: string;
  name: string;
  rssUrl: string;
  active: boolean;
  lang: 'tr' | 'en';
}

/**
 * Haber adayları bu RSS'lerden toplanır (2026-11-23 kontrol edildi: hepsi güncel öğe döndürüyor). Seçim, tekilleştirme ve
 * ayrıntılı yazım Claude Haiku ile yapılır (server/news/aiNews.ts); burada yalnız ham aday listesi var. Genel spor
 * akışlarındaki futbol dışı haberleri seçim adımı eler. NTV Spor / Milliyet / Fanatik RSS'leri boş döndüğü için yok.
 */
export const NEWS_SOURCES: NewsSource[] = [
  { id: 'aa', name: 'Anadolu Ajansı', rssUrl: 'https://www.aa.com.tr/tr/rss/default?cat=spor', active: true, lang: 'tr' },
  { id: 'aspor', name: 'A Spor', rssUrl: 'https://www.aspor.com.tr/rss/futbol.xml', active: true, lang: 'tr' },
  { id: 'sabah', name: 'Sabah Spor', rssUrl: 'https://www.sabah.com.tr/rss/spor.xml', active: true, lang: 'tr' },
  { id: 'hurriyet', name: 'Hürriyet Spor', rssUrl: 'https://www.hurriyet.com.tr/rss/spor', active: true, lang: 'tr' },
  { id: 'haberturk', name: 'Habertürk Spor', rssUrl: 'https://www.haberturk.com/rss/spor.xml', active: true, lang: 'tr' },
  { id: 'cnnturk', name: 'CNN Türk Spor', rssUrl: 'https://www.cnnturk.com/feed/rss/spor/news', active: true, lang: 'tr' },
  { id: 'sozcu', name: 'Sözcü Spor', rssUrl: 'https://www.sozcu.com.tr/feeds-rss-category-spor', active: true, lang: 'tr' },
  { id: 'bbc', name: 'BBC Sport', rssUrl: 'https://feeds.bbci.co.uk/sport/football/rss.xml', active: true, lang: 'en' },
];
