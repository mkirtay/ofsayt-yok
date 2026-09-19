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
 * Sportmonks CDN'i lig görselini `leagues/{id % 32}/{id}.png` altında sunar
 * (ör. 600 → leagues/24/600.png, 8 → leagues/8/8.png). API yanıtı elde
 * yokken deterministik yedek olarak kullanılır.
 */
export function sportmonksLeagueLogoUrl(sportmonksLeagueId: number): string | null {
  if (!Number.isInteger(sportmonksLeagueId) || sportmonksLeagueId <= 0) return null;
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
