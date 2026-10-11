/**
 * Tahmin oyunu görünürlük bayrağı — `GAME_ENABLED` (sunucu env; varsayılan KAPALI).
 *
 * | Değer                              | Mod       | Davranış                                                                  |
 * | yok / "" / 0 / false / off / tanımsız | `off`     | /tahmin*, /admin/tahmin, /api/game/*, /api/admin/game/* → 404; menü + sitemap gizli |
 * | 1 / true / on / preview            | `preview` | Yalnız ADMIN rolü ya da `GAME_PREVIEW_EMAILS` listesindeki e-postalar; diğer herkese 404. noindex, önbellek kişisel (private, no-store); menü + sitemap gizli |
 * | public                             | `public`  | Herkese açık (lansman). Menü + sitemap görünür, indekslenir.               |
 *
 * "Açık" (1/true) bilerek ÖNİZLEME demek: herkese açmak için ayrıca `public` yazmak gerekir. Bilinmeyen değer → kapalı.
 * İstemci (mobil menü) derlemede `NEXT_PUBLIC_GAME_PUBLIC` ile öğrenir (next.config.ts); env değişince yeniden deploy gerekir.
 */
import { GAME_BRAND } from '@/config/brand';

export type GameMode = 'off' | 'preview' | 'public';

export function parseGameMode(raw: string | undefined | null): GameMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'public') return 'public';
  if (v === '1' || v === 'true' || v === 'on' || v === 'preview') return 'preview';
  return 'off';
}

export function gameMode(): GameMode {
  return parseGameMode(process.env.GAME_ENABLED);
}

/** `GAME_PREVIEW_EMAILS`: virgül / boşluk ayrımlı, küçük harfe çevrilmiş. */
export function parseAllowlist(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@')),
  );
}

export function gamePreviewEmails(): Set<string> {
  return parseAllowlist(process.env.GAME_PREVIEW_EMAILS);
}

export type GameViewer = { role?: string | null; email?: string | null } | null;

/** Saf karar: bu kullanıcı oyunu görebilir mi? */
export function canSeeGame(mode: GameMode, viewer: GameViewer, allowlist: ReadonlySet<string>): boolean {
  if (mode === 'off') return false;
  if (mode === 'public') return true;
  if (!viewer) return false;
  if (viewer.role === 'ADMIN') return true;
  return !!viewer.email && allowlist.has(viewer.email.trim().toLowerCase());
}

/** Menü bağlantısı yalnız herkese açıkken (istemci; derlemede gömülü). */
export const GAME_PUBLIC_CLIENT = process.env.NEXT_PUBLIC_GAME_PUBLIC === '1';

/** Site haritası girişleri: yalnız herkese açıkken; kapalı / önizlemede yok. */
export function gameSitemapRoutes(mode: GameMode = gameMode()): { path: string; priority: string; changefreq: string }[] {
  if (mode !== 'public') return [];
  return [
    { path: GAME_BRAND.basePath, priority: '0.7', changefreq: 'daily' },
    { path: `${GAME_BRAND.basePath}/siralama`, priority: '0.5', changefreq: 'daily' },
    { path: `${GAME_BRAND.basePath}/kurallar`, priority: '0.4', changefreq: 'monthly' },
  ];
}
