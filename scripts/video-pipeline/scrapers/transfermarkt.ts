import axios from 'axios';
import * as cheerio from 'cheerio';
import { HEADERS, SCRAPER_DELAY_MS } from '../config';
import { getTeamSource } from '../teams';
import type { TransfermarktData } from '../types';

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeTransfermarkt(team: string): Promise<TransfermarktData | null> {
  const path = getTeamSource(team)?.transfermarkt;

  if (!path) {
    console.warn(`[Transfermarkt] "${team}" için URL bulunamadı, atlanıyor.`);
    return null;
  }

  const url = `https://www.transfermarkt.com/${path}`;

  try {
    await delay(SCRAPER_DELAY_MS);
    const { data } = await axios.get(url, {
      headers: {
        ...HEADERS,
        Referer: 'https://www.transfermarkt.com/',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      timeout: 15_000,
    });

    const $ = cheerio.load(data);

    // Toplam kadro değeri — Transfermarkt'ta genelde "Total market value" satırında
    let squadValue = 'Bilinmiyor';

    // Yöntem 1: data-value attribute ile sayısal değer
    $('[data-value]').each((_, el) => {
      const val = $(el).attr('data-value') ?? '';
      // Gerçek değer milyonluk sayı olmalı
      if (/^\d{6,}$/.test(val)) {
        const numVal = parseInt(val, 10);
        if (numVal > 1_000_000) {
          squadValue = `€${(numVal / 1_000_000).toFixed(0)}M`;
          return false;
        }
      }
    });

    // Yöntem 2: "Total market value" metni yanındaki değer
    if (squadValue === 'Bilinmiyor') {
      $('td').each((_, el) => {
        const text = $(el).text().trim();
        // €XXXm veya €X.XXbn formatı
        if (/^€[\d,.]+[mbMB]?n?$/.test(text) && text !== '€') {
          squadValue = text;
          return false;
        }
      });
    }

    // Yöntem 3: Sayfa alt kısmındaki toplam satır
    if (squadValue === 'Bilinmiyor') {
      $('table.items tfoot td').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('€') && (text.includes('m') || text.includes('bn') || text.includes('Bn'))) {
          squadValue = text.replace(/Total:?\s*/i, '').trim();
          return false;
        }
      });
    }

    // Ortalama yaş — footer satırında veya ayrı bir tablo hücresinde
    let avgAge = 0;
    $('tfoot td').each((_, el) => {
      const text = $(el).text().trim().replace(',', '.');
      const num = parseFloat(text);
      if (!isNaN(num) && num > 15 && num < 40) {
        avgAge = num;
        return false;
      }
    });

    // Yıldız oyuncu (en yüksek değerli — ilk sıra en değerlisi genelde)
    let starPlayer = null;
    $('table.items tbody tr').each((_, row) => {
      const name = $(row).find('td.hauptlink a').first().text().trim();
      if (!name || name.length < 2) return;

      // Değer hücresi — sağa hizalı hauptlink
      const valueText = $(row).find('td.rechts.hauptlink').first().text().trim();
      const ageText = $(row).find('td:nth-child(4)').text().trim();
      const age = parseInt(ageText, 10);
      const club = $(row).find('td img[title]').attr('title') ?? '';

      if (name && valueText && valueText.includes('€')) {
        starPlayer = {
          name,
          value: valueText,
          age: isNaN(age) ? 0 : age,
          club,
        };
        return false; // İlk geçerli oyuncuyu al
      }
    });

    return { squadValue, avgAge, starPlayer };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Transfermarkt] Hata (${team}): ${message}`);
    return null;
  }
}
