import axios from 'axios';
import * as cheerio from 'cheerio';
import { HEADERS, SCRAPER_DELAY_MS } from '../config';
import { getTeamSource } from '../teams';
import type { FbrefData } from '../types';

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeFbref(team: string): Promise<FbrefData | null> {
  const fbrefName = getTeamSource(team)?.fbref;

  if (!fbrefName) {
    console.warn(`[FBref] "${team}" için eşleşme bulunamadı, atlanıyor.`);
    return null;
  }

  // FBref milli takımlar sayfası
  const searchUrl = `https://fbref.com/en/search/search.fcgi?search=${encodeURIComponent(fbrefName)}+national+team`;

  try {
    await delay(SCRAPER_DELAY_MS);
    const { data: searchData } = await axios.get(searchUrl, {
      headers: { ...HEADERS, Referer: 'https://fbref.com/' },
      timeout: 15_000,
    });

    const $s = cheerio.load(searchData);

    // İlk sonuç linkini bul
    let teamUrl: string | null = null;
    $s('div.search-item-name a').each((_, el) => {
      const href = $s(el).attr('href') ?? '';
      const text = $s(el).text().trim();
      if (href.includes('/squads/') && text.toLowerCase().includes(fbrefName.toLowerCase().split(' ')[0].toLowerCase())) {
        teamUrl = `https://fbref.com${href}`;
        return false;
      }
    });

    if (!teamUrl) {
      console.warn(`[FBref] "${fbrefName}" için takım sayfası bulunamadı.`);
      return null;
    }

    await delay(SCRAPER_DELAY_MS);
    const { data: teamData } = await axios.get(teamUrl, {
      headers: { ...HEADERS, Referer: searchUrl },
      timeout: 15_000,
    });

    const $ = cheerio.load(teamData);

    // Sezon istatistiklerinden Gol/Maç, xG/Maç, Top'a Sahip Olma
    let goalsPerGame: number | null = null;
    let xgPerGame: number | null = null;
    let possessionPct: number | null = null;
    let season = '2024-25';

    // Takım istatistik tablosu
    const statsTable = $('table#stats_shooting, table#stats_standard').first();
    if (statsTable.length) {
      const headerRow = statsTable.find('thead tr').last();
      const headers: string[] = [];
      headerRow.find('th').each((_, th) => {
        headers.push($(th).attr('data-stat') ?? $(th).text().trim().toLowerCase());
      });

      const firstDataRow = statsTable.find('tbody tr').first();
      if (firstDataRow.length) {
        const gIdx = headers.indexOf('goals_per90') !== -1 ? headers.indexOf('goals_per90') : headers.indexOf('gls');
        const xgIdx = headers.indexOf('xg');
        const posIdx = headers.indexOf('possession');

        const cells: string[] = [];
        firstDataRow.find('td').each((_, td) => cells.push($(td).text().trim()));

        if (gIdx >= 0 && cells[gIdx]) goalsPerGame = parseFloat(cells[gIdx]) || null;
        if (xgIdx >= 0 && cells[xgIdx]) xgPerGame = parseFloat(cells[xgIdx]) || null;
        if (posIdx >= 0 && cells[posIdx]) possessionPct = parseFloat(cells[posIdx]) || null;
      }
    }

    // Sayfa başlığından sezon bilgisi
    const pageTitle = $('h1[itemprop="name"]').text().trim();
    const seasonMatch = pageTitle.match(/(\d{4}-\d{2,4}|\d{4})/);
    if (seasonMatch) season = seasonMatch[1];

    return { goalsPerGame, xgPerGame, possessionPct, season };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[FBref] Hata (${team}): ${message}`);
    return null;
  }
}
