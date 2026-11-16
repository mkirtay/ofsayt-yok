/**
 * Günlük IndexNow bildirimi (vercel.json cron, `Authorization: Bearer $CRON_SECRET`): değişen sayfaları Bing / Yandex'e
 * tek POST ile bildirir — ana sayfa, /bugun, lig ve güncel hafta sayfaları, dün + bugün + yarının maçları.
 * Kaynak: sitemap bölümleriyle aynı önbellekli listeler (ek Sportmonks yükü yok denecek kadar az).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { siteBaseUrl } from '@/lib/siteUrl';
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY } from '@/config/indexNow';
import { matchesSection, pagesSection } from '@/server/sitemap/sections';

const MAX_URLS = 10_000;

export function pickIndexNowUrls(urls: { loc: string; lastmod?: string }[], days: string[]): string[] {
  const set = new Set<string>();
  for (const u of urls) if (u.lastmod && days.includes(u.lastmod)) set.add(u.loc);
  return [...set].slice(0, MAX_URLS);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const now = Date.now();
    const days = [-1, 0, 1].map((o) => new Date(now + o * 86_400_000).toISOString().slice(0, 10));
    const [pages, { matches }] = await Promise.all([pagesSection(now), matchesSection(now)]);
    const urlList = pickIndexNowUrls([...pages, ...matches], days);
    if (!urlList.length) return res.status(200).json({ submitted: 0 });
    const base = siteBaseUrl();
    const host = new URL(base).host;
    const r = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.status(200).json({ submitted: urlList.length, status: r.status });
  } catch (e) {
    captureError('cron-indexnow', e);
    return res.status(500).json({ error: 'indexnow failed' });
  }
}
