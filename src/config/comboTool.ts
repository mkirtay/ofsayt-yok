/**
 * Kombine aracı (yalnız ADMIN) bayrağı — `COMBO_TOOL_ENABLED` (sunucu env; varsayılan KAPALI).
 * 1 / true / on → açık. Kapalıyken /admin/kombine ve /api/admin/kombine 404; API-Football'a istek / iş yok.
 * Hiçbir public sayfa, menü, sitemap ya da robots.txt bu araca değinmez.
 */
export function parseComboFlag(raw: string | undefined | null): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function comboToolEnabled(): boolean {
  return parseComboFlag(process.env.COMBO_TOOL_ENABLED);
}
