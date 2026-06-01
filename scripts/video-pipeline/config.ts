export const SCRAPER_DELAY_MS = 1500;

export const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Not: Takım → kaynak eşlemeleri tek kaynakta toplandı → `scripts/video-pipeline/teams.ts`

export function toSlug(team: string): string {
  return team
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9ğüşöçıİ-]/g, '')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i');
}
