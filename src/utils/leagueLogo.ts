import type { SidebarLeague } from '@/config/leagues';
import { resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';
import { uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';

const SPORTMONKS_LEAGUE_CDN = 'https://cdn.sportmonks.com/images/soccer/leagues';

/**
 * Sportmonks lig `image_path` değerini doğrular. Kırık/anlamsız değerler (boş,
 * "null", göreli yol, placeholder görseli) `null` döner → çağıran bir sonraki
 * kaynağa düşer. Tam URL (http/https) VEYA uygulamanın kendi `/images/...` yolu kabul edilir.
 */
export function parseLeagueImagePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v === 'null' || v === 'undefined') return null;
  if (/placeholder/i.test(v)) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Planımızda görseli klasörsüz (`leagues/{id}.png`) duran ligler — 2026-10-02 `GET /leagues?select=id,image_path`:
 * 2 Şampiyonlar Ligi, 72 Eredivisie, 271 Danimarka Superliga, 501 İskoçya Premiership (`{id % 32}/` yolu 404).
 */
const ROOT_PATH_LEAGUE_IDS = new Set([2, 72, 271, 501]);

/**
 * Sportmonks CDN'i lig görselini çoğunlukla `leagues/{id % 32}/{id}.png` altında sunar
 * (ör. 600 → leagues/24/600.png, 8 → leagues/8/8.png); bazıları kökte (`ROOT_PATH_LEAGUE_IDS`). API yanıtı elde
 * yokken deterministik yedek olarak kullanılır.
 */
export function sportmonksLeagueLogoUrl(sportmonksLeagueId: number): string | null {
  if (!Number.isInteger(sportmonksLeagueId) || sportmonksLeagueId <= 0) return null;
  if (ROOT_PATH_LEAGUE_IDS.has(sportmonksLeagueId)) return `${SPORTMONKS_LEAGUE_CDN}/${sportmonksLeagueId}.png`;
  return `${SPORTMONKS_LEAGUE_CDN}/${sportmonksLeagueId % 32}/${sportmonksLeagueId}.png`;
}

/**
 * Sidebar lig logosu — öncelik:
 * 1) canlı API `image_path` (fikstürdeki `league.image_path` → `competition.logo`)
 * 2) config'teki statik `logo`
 * 3) UEFA kupaları için yerel svg
 * 4) doğrulanmış legacy→Sportmonks lig id'sinden türetilen CDN URL'i
 * Hiçbiri yoksa `null` (UI nötr placeholder çizer — artık kırık ülke-bayrağı proxy'sine düşülmez).
 */
export function resolveSidebarLeagueLogo(
  league: Pick<SidebarLeague, 'id' | 'logo'>,
  apiImagePath?: unknown,
): string | null {
  return (
    parseLeagueImagePath(apiImagePath) ??
    parseLeagueImagePath(league.logo) ??
    uefaCompetitionLogoSrcById(league.id) ??
    (() => {
      const smId = resolveSportmonksLeagueId(league.id);
      return smId != null ? sportmonksLeagueLogoUrl(smId) : null;
    })()
  );
}
